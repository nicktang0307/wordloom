"""Python replacement for Wordloom's API; the React UI keeps the same contract."""
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal
import hmac
import json
import os
import re
import sqlite3
import time
import uuid
from urllib.parse import quote, urlparse
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, field_validator

class WordInput(BaseModel):
    word: str = Field(min_length=1, max_length=100)
    meaning: str = Field(default='', max_length=500)
    zh: str = Field(default='', max_length=500)
    context: str = Field(default='', max_length=1500)
    source: str = Field(default='', max_length=500)

    @field_validator('word')
    @classmethod
    def normalise(cls, value):
        value = value.strip().lower()
        if not value:
            raise ValueError('Word cannot be blank')
        return value

class ReadingInput(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    url: str = Field(min_length=1, max_length=2000)
    body: str = Field(min_length=20, max_length=150000)
    category: str = Field(default='My reading', max_length=80)

    @field_validator('title')
    @classmethod
    def title_required(cls, value):
        if not value.strip():
            raise ValueError('Title is required')
        return value.strip()

    @field_validator('url')
    @classmethod
    def valid_url(cls, value):
        parsed = urlparse(value.strip())
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('A valid source URL is required')
        return parsed._replace(fragment='').geturl()

    @field_validator('body')
    @classmethod
    def clean_body(cls, value):
        value = '\n'.join(line for line in value.replace('\r\n', '\n').replace('\r', '\n').split('\n')
                          if line.strip().upper() != 'ADVERTISEMENT')
        value = re.sub(r'\bADVERTISEMENT\b', '', value)
        value = re.sub(r'[\t ]{2,}', ' ', value)
        value = re.sub(r'\n[\t ]*\n(?:[\t ]*\n)+', '\n\n', value).strip()
        if len(value) < 20:
            raise ValueError('Article text is required')
        return value

class ReviewInput(BaseModel):
    action: Literal['review']
    id: str = Field(max_length=100)
    rating: Literal['again', 'remember']
    expectedStage: int | None = Field(default=None, ge=0, le=6)
    expectedDue: int | None = Field(default=None, ge=0)

class Lesson(BaseModel):
    model_config = ConfigDict(extra='forbid')
    step: int = Field(ge=0, le=5)
    help: bool
    sentence: str = Field(max_length=1500)
    spelling: str = Field(max_length=100)
    gap: str = Field(max_length=100)
    speaking: Literal['pending', 'done', 'skip']
    completed: bool

class PracticeInput(BaseModel):
    id: str = Field(max_length=100)
    lesson: Lesson
    finish: bool = False

class ImportedWord(WordInput):
    id: str = Field(min_length=1, max_length=100)
    due: int = Field(ge=0)
    stage: int = Field(ge=0, le=6)
    practice_json: str = Field(default='', max_length=6000)
    last_sentence: str = Field(default='', max_length=1500)

    @field_validator('practice_json')
    @classmethod
    def valid_progress(cls, value):
        if value:
            Lesson.model_validate_json(value)
        return value


def schedule(stage, needs_practice, now=None):
    now = int(time.time() * 1000) if now is None else now
    next_stage = 0 if needs_practice else min(stage + 1, 6)
    delay = 600_000 if needs_practice else [0, 1, 3, 7, 14, 30, 60][next_stage] * 86_400_000
    return next_stage, now + delay


def choose_articles(results):
    """Pick up to five distinct sections; keep metadata and NYT links only."""
    chosen, seen_urls, seen_sections = [], set(), set()
    for item in results:
        url = item.get('url', '')
        section = item.get('section', '')
        parsed = urlparse(url)
        if parsed.scheme != 'https' or not (parsed.hostname == 'nytimes.com' or (parsed.hostname or '').endswith('.nytimes.com')):
            continue
        if not item.get('title') or not section or url in seen_urls or section in seen_sections:
            continue
        chosen.append({'title': str(item['title'])[:500], 'url': url,
                       'summary': str(item.get('abstract', ''))[:1500],
                       'category': section, 'published_at': item.get('published_date', ''),
                       'source': 'The New York Times', 'content_type': 'link'})
        seen_urls.add(url)
        seen_sections.add(section)
        if len(chosen) == 5:
            break
    return chosen


def create_app(db_path=None, service_token=None, nyt_key=None):
    path = Path(db_path or os.getenv('WORDLOOM_DB_PATH', './data/wordloom.db'))
    token = service_token if service_token is not None else os.getenv('WORDLOOM_SERVICE_TOKEN', '')
    api_key = nyt_key if nyt_key is not None else os.getenv('NYT_API_KEY', '')

    @contextmanager
    def database():
        conn = sqlite3.connect(path, timeout=15)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    @asynccontextmanager
    async def lifespan(app):
        if len(token) < 32:
            raise RuntimeError('Set WORDLOOM_SERVICE_TOKEN to a random secret of at least 32 characters.')
        path.parent.mkdir(parents=True, exist_ok=True)
        with database() as conn:
            conn.execute('PRAGMA journal_mode=WAL')
            conn.executescript('''
              CREATE TABLE IF NOT EXISTS words (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, word TEXT NOT NULL,
                meaning TEXT NOT NULL, zh TEXT NOT NULL, context TEXT NOT NULL,
                source TEXT NOT NULL, due INTEGER NOT NULL, stage INTEGER NOT NULL DEFAULT 0,
                practice_json TEXT NOT NULL DEFAULT '', last_sentence TEXT NOT NULL DEFAULT '',
                UNIQUE(owner,word));
              CREATE TABLE IF NOT EXISTS reading_articles (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
                url TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL,
                created_at INTEGER NOT NULL, UNIQUE(owner,url));
              CREATE TABLE IF NOT EXISTS article_cache (
                day TEXT PRIMARY KEY, content TEXT NOT NULL);
            ''')
        yield

    app = FastAPI(title='Wordloom Python API', version='0.1.0', lifespan=lifespan)
    bearer = HTTPBearer(auto_error=False)

    def owner(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
              user: Annotated[str | None, Header(alias='X-Wordloom-User')] = None):
        if not token or credentials is None or not hmac.compare_digest(credentials.credentials, token):
            raise HTTPException(401, 'Invalid service credentials.')
        if not user or len(user) > 200:
            raise HTTPException(401, 'A verified user is required.')
        return user

    User = Annotated[str, Depends(owner)]

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse({'error': str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return JSONResponse({'error': 'Invalid input. Check the word, field lengths, or lesson state.'}, status_code=422)

    @app.exception_handler(sqlite3.Error)
    async def storage_error(request, exc):
        return JSONResponse({'error': 'Notebook storage is unavailable. Please try again.'}, status_code=503)

    @app.get('/health')
    def health():
        with database() as conn:
            conn.execute('SELECT 1')
        return {'ok': True, 'backend': 'python'}

    @app.get('/api/reading')
    def list_reading(user: User):
        with database() as conn:
            return [dict(row) for row in conn.execute(
                'SELECT id,title,url,body,category,created_at FROM reading_articles WHERE owner=? ORDER BY created_at DESC', (user,))]

    @app.post('/api/reading')
    def save_reading(body: ReadingInput, user: User):
        with database() as conn:
            conn.execute('''INSERT INTO reading_articles(id,owner,title,url,body,category,created_at)
                VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,url) DO UPDATE SET
                title=excluded.title,body=excluded.body,category=excluded.category''',
                (str(uuid.uuid4()),user,body.title,body.url,body.body,body.category.strip() or 'My reading',int(time.time()*1000)))
            row = conn.execute('SELECT id,title,url,body,category,created_at FROM reading_articles WHERE owner=? AND url=?', (user,body.url)).fetchone()
            return dict(row)

    @app.get('/api/words')
    def list_words(user: User):
        with database() as conn:
            return [dict(row) for row in conn.execute('SELECT * FROM words WHERE owner=? ORDER BY due', (user,))]

    @app.post('/api/words')
    def save_word(body: ReviewInput | WordInput, user: User):
        with database() as conn:
            if isinstance(body, ReviewInput):
                conn.execute('BEGIN IMMEDIATE')
                row = conn.execute('SELECT stage,due FROM words WHERE id=? AND owner=?', (body.id, user)).fetchone()
                if row is None:
                    raise HTTPException(404, 'Word not found.')
                if (body.expectedStage is None) != (body.expectedDue is None):
                    raise HTTPException(400, 'Invalid review state.')
                if body.expectedStage is not None and (row['stage'] != body.expectedStage or row['due'] != body.expectedDue):
                    return {'ok': True}
                stage, due = schedule(row['stage'], body.rating == 'again')
                conn.execute('UPDATE words SET stage=?,due=? WHERE id=? AND owner=?', (stage, due, body.id, user))
            else:
                conn.execute('''INSERT INTO words(id,owner,word,meaning,zh,context,source,due)
                 VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner,word) DO UPDATE SET
                 meaning=excluded.meaning,zh=excluded.zh,context=excluded.context,source=excluded.source''',
                 (str(uuid.uuid4()), user, body.word, body.meaning.strip(), body.zh.strip(),
                  body.context.strip(), body.source.strip(), int(time.time()*1000)))
        return {'ok': True}

    @app.post('/api/practice')
    def practice(body: PracticeInput, user: User):
        with database() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row = conn.execute('SELECT * FROM words WHERE id=? AND owner=?', (body.id, user)).fetchone()
            if row is None:
                raise HTTPException(404, 'Word not found.')
            lesson = body.lesson
            if body.finish:
                if lesson.step != 5 or not lesson.completed or not lesson.sentence.strip():
                    raise HTTPException(400, 'Finish the lesson first.')
                previous = json.loads(row['practice_json'] or '{}')
                if previous.get('completed'):
                    return {'ok': True}
                stage, due = schedule(row['stage'], lesson.help)
                conn.execute('UPDATE words SET practice_json=?,last_sentence=?,stage=?,due=? WHERE id=? AND owner=?',
                             (lesson.model_dump_json(), lesson.sentence, stage, due, body.id, user))
            else:
                conn.execute('UPDATE words SET practice_json=? WHERE id=? AND owner=?',
                             (lesson.model_dump_json(), body.id, user))
        return {'ok': True}

    @app.post('/api/import')
    def import_words(body: list[ImportedWord], user: User):
        if len(body) > 10000:
            raise HTTPException(400, 'Import at most 10,000 words at once.')
        with database() as conn:
            for word in body:
                conn.execute('''INSERT INTO words(id,owner,word,meaning,zh,context,source,due,stage,practice_json,last_sentence)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING''',
                  (word.id,user,word.word,word.meaning,word.zh,word.context,word.source,word.due,
                   word.stage,word.practice_json,word.last_sentence))
            count = conn.execute('SELECT COUNT(*) FROM words WHERE owner=?', (user,)).fetchone()[0]
        return {'ok': True, 'total_words': count}

    @app.get('/api/lookup')
    async def lookup(user: User, word: str = Query(min_length=1,max_length=80)):
        word = word.strip().lower()
        if not re.fullmatch(r"[a-z][a-z '-]{0,79}",word):
            raise HTTPException(400, 'Try a short English word or phrase.')
        curated_path = Path(__file__).with_name('focus_words.json')
        curated = json.loads(curated_path.read_text())
        if word in curated:
            return {'senses': [curated[word]], 'provider': 'Wordloom'}
        try:
            async with httpx.AsyncClient(timeout=8,follow_redirects=False) as client:
                response = await client.get('https://api.dictionaryapi.dev/api/v2/entries/en/'+quote(word,safe=''))
                response.raise_for_status()
                entries = response.json()
            senses = [{'meaning': d['definition'][:500], 'zh': '', 'part': m.get('partOfSpeech',''),
                       'example': d.get('example','')[:1500]}
                      for entry in entries for m in entry.get('meanings',[])
                      for d in m.get('definitions',[]) if 'definition' in d][:8]
            return {'senses':senses,'provider':'Free Dictionary API','url':'https://dictionaryapi.dev/'}
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise HTTPException(503, 'Dictionary lookup is unavailable. You can still save the word.')

    @app.get('/api/articles')
    async def daily_articles(user: User):
        if not api_key:
            raise HTTPException(503, 'NYT discovery needs an NYT developer API key. Full article text is not imported.')
        day = datetime.now(timezone.utc).date().isoformat()
        with database() as conn:
            row = conn.execute('SELECT content FROM article_cache WHERE day=?',(day,)).fetchone()
        if row:
            return {'enabled':True,'date':day,'articles':json.loads(row['content']),'content_type':'links'}
        try:
            async with httpx.AsyncClient(timeout=12,follow_redirects=False) as client:
                response = await client.get('https://api.nytimes.com/svc/topstories/v2/home.json',params={'api-key':api_key})
                response.raise_for_status()
                articles = choose_articles(response.json()['results'])
            if not articles:
                raise ValueError('No articles')
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise HTTPException(503, 'NYT picks are unavailable. Please try again later.')
        with database() as conn:
            conn.execute('INSERT OR REPLACE INTO article_cache VALUES (?,?)',(day,json.dumps(articles)))
            conn.execute('DELETE FROM article_cache WHERE day < date(?, \'-7 days\')',(day,))
        return {'enabled':True,'date':day,'articles':articles,'content_type':'links'}

    return app

app = create_app()
