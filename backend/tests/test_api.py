import json
import pytest
from fastapi.testclient import TestClient
from app.main import create_app, choose_articles, schedule

TOKEN='test-service-token-'+'x'*32

def headers(user='nick'):
    return {'Authorization':'Bearer '+TOKEN,'X-Wordloom-User':user}

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path/'test.db',TOKEN,'')) as client:
        yield client

def save(client, word='resilient', user='nick'):
    assert client.post('/api/words',headers=headers(user),json={'word':word,'meaning':'Able to recover','context':'The town remained resilient after the storm.'}).status_code == 200
    return client.get('/api/words',headers=headers(user)).json()[0]

def test_requires_service_auth(client):
    assert client.get('/api/words',headers={'X-Wordloom-User':'nick'}).status_code==401
    assert client.get('/api/words',headers={'Authorization':'Bearer wrong','X-Wordloom-User':'nick'}).status_code==401

def test_words_are_owned_and_deduplicated(client):
    word=save(client)
    save(client,' RESILIENT ')
    assert len(client.get('/api/words',headers=headers()).json())==1
    assert client.get('/api/words',headers=headers('other')).json()==[]
    r=client.post('/api/words',headers=headers('other'),json={'action':'review','id':word['id'],'rating':'again'})
    assert r.status_code==404

def test_unknown_word_can_be_saved(client):
    assert client.post('/api/words',headers=headers(),json={'word':'unfamiliar'}).status_code==200
    assert client.post('/api/words',headers=headers(),json={'word':'   '}).status_code==422

def test_progress_and_idempotent_finish(client):
    word=save(client)
    lesson={'step':1,'help':False,'sentence':'','spelling':'','gap':'','speaking':'pending','completed':False}
    assert client.post('/api/practice',headers=headers(),json={'id':word['id'],'lesson':lesson}).status_code==200
    found=client.get('/api/words',headers=headers()).json()[0]
    assert json.loads(found['practice_json'])['step']==1
    lesson.update(step=5,sentence='My community remained resilient during a difficult year.',speaking='done',completed=True)
    payload={'id':word['id'],'lesson':lesson,'finish':True}
    assert client.post('/api/practice',headers=headers(),json=payload).status_code==200
    assert client.post('/api/practice',headers=headers(),json=payload).status_code==200
    found=client.get('/api/words',headers=headers()).json()[0]
    assert found['stage']==1
    assert found['last_sentence']==lesson['sentence']
    assert client.post('/api/practice',headers=headers('other'),json=payload).status_code==404

def test_import_preserves_state_and_does_not_overwrite(client):
    record={'id':'old-uuid','word':'canopy','meaning':'tree cover','due':777,'stage':3,'last_sentence':'The canopy shaded the narrow path.'}
    assert client.post('/api/import',headers=headers(),json=[record]).status_code==200
    record['meaning']='changed by duplicate import'
    client.post('/api/import',headers=headers(),json=[record])
    row=client.get('/api/words',headers=headers()).json()[0]
    assert row['meaning']=='tree cover' and row['due']==777 and row['stage']==3

def test_curated_lookup_and_missing_nyt_key(client):
    r=client.get('/api/lookup?word=resilient',headers=headers())
    assert r.status_code==200 and r.json()['senses'][0]['zh']
    r=client.get('/api/articles',headers=headers())
    assert r.status_code==503 and 'API key' in r.json()['error']

def test_selection_is_diverse_and_has_no_body():
    records=[{'title':'Test','url':f'https://www.nytimes.com/{i}','section':section,'abstract':'Summary'} for i,section in enumerate(['science','science','business','arts','world','technology'])]
    records.insert(0,{'title':'bad','url':'https://nytimes.com.attacker.test/','section':'bad'})
    chosen=choose_articles(records)
    assert len(chosen)==5 and len({a['category'] for a in chosen})==5
    assert all(a['content_type']=='link' and 'body' not in a for a in chosen)

def test_review_intervals():
    assert schedule(3,True,0)==(0,600000)
    assert schedule(0,False,0)==(1,86400000)
    assert schedule(6,False,0)==(6,60*86400000)

def test_daily_nyt_cache_with_mock_source(tmp_path,monkeypatch):
    import httpx
    import app.main as module
    real_client=httpx.AsyncClient
    calls=[]
    def reply(request):
        calls.append(request.url.path)
        return httpx.Response(200,json={'results':[{'title':'Fixture article','url':f'https://www.nytimes.com/test/{i}','section':s,'abstract':'Fixture summary'} for i,s in enumerate(['science','business','arts','world','technology'])]})
    monkeypatch.setattr(module.httpx,'AsyncClient',lambda **kwargs:real_client(transport=httpx.MockTransport(reply),**kwargs))
    with TestClient(create_app(tmp_path/'cache.db',TOKEN,'test-key')) as client:
        first=client.get('/api/articles',headers=headers())
        second=client.get('/api/articles',headers=headers())
        assert first.status_code==200 and first.json()==second.json()
        assert len(first.json()['articles'])==5 and len(calls)==1

def test_progress_survives_service_restart(tmp_path):
    path=tmp_path/'restart.db'
    with TestClient(create_app(path,TOKEN,'')) as first:
        word=save(first)
    with TestClient(create_app(path,TOKEN,'')) as second:
        assert second.get('/api/words',headers=headers()).json()[0]['id']==word['id']

def test_reading_import_is_private_and_updates_in_place(client):
    payload={'title':'Reading test','url':'https://example.com/story','body':'First meaningful paragraph.\n\nADVERTISEMENT\n\nLast meaningful paragraph.','category':'World'}
    assert client.get('/api/reading').status_code==401
    assert client.post('/api/reading',json=payload).status_code==401
    first=client.post('/api/reading',headers=headers(),json=payload)
    assert first.status_code==200
    assert first.json()['body']=='First meaningful paragraph.\n\nLast meaningful paragraph.'
    payload['body']='Updated article content with a different final sentence.'
    updated=client.post('/api/reading',headers=headers(),json=payload).json()
    assert updated['id']==first.json()['id']
    assert len(client.get('/api/reading',headers=headers()).json())==1
    assert client.get('/api/reading',headers=headers('other')).json()==[]
    client.post('/api/reading',headers=headers('other'),json={**payload,'title':'Other reader copy'})
    assert client.get('/api/reading',headers=headers()).json()[0]['title']=='Reading test'

def test_reading_rejects_unsafe_url_and_empty_content(client):
    payload={'title':'Title','url':'javascript:alert(1)','body':'A sufficiently long article body.'}
    assert client.post('/api/reading',headers=headers(),json=payload).status_code==422
    payload['url']='https://example.com/story'
    payload['body']='ADVERTISEMENT\n\nADVERTISEMENT'
    assert client.post('/api/reading',headers=headers(),json=payload).status_code==422


def test_spelling_retry_preserves_lesson_and_does_not_advance_twice(client):
    word = save(client)
    lesson = {'step': 1, 'help': False, 'sentence': '', 'spelling': '', 'gap': '', 'speaking': 'pending', 'completed': False}
    client.post('/api/practice', headers=headers(), json={'id': word['id'], 'lesson': lesson})
    payload = {'action': 'review', 'id': word['id'], 'rating': 'remember', 'expectedStage': word['stage'], 'expectedDue': word['due']}
    assert client.post('/api/words', headers=headers('other'), json=payload).status_code == 404
    assert client.post('/api/words', headers=headers(), json=payload).status_code == 200
    first = client.get('/api/words', headers=headers()).json()[0]
    assert first['stage'] == 1
    assert client.post('/api/words', headers=headers(), json=payload).status_code == 200
    retry = client.get('/api/words', headers=headers()).json()[0]
    assert retry['due'] == first['due'] and retry['stage'] == 1
    assert json.loads(retry['practice_json']) == lesson
    payload.update(rating='again', expectedStage=retry['stage'], expectedDue=retry['due'])
    assert client.post('/api/words', headers=headers(), json=payload).status_code == 200
    assert client.get('/api/words', headers=headers()).json()[0]['stage'] == 0
