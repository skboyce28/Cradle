#!/usr/bin/env python3
"""Outside check of a live Cradle site, run every 30 minutes by .github/workflows/monitor.yml.

It looks at the site from outside Supabase and Netlify, so it still notices when either is down.
Any failed check makes the run fail, and GitHub emails you about failed scheduled runs.

  CRADLE_SITE_URL=https://your-cradle.netlify.app python3 tools/monitor.py

Checks:
  1. The app page loads (HTTP 200, and it's Cradle)
  2. /version.json says what's deployed
  3. The database answers: cradle_status() through Supabase, using the address and publishable key
     the status page already has (so nothing secret is needed here)
  4. The 5-minute uptime checks inside Supabase are still running, if they're set up
  5. The every-minute notification job is mostly succeeding, if it's set up
  6. The deploy isn't stuck: if main's newest commit passed its tests over 45 minutes ago, it's live
Only the standard library; prints a short report and writes it to $GITHUB_STEP_SUMMARY when set.
"""
import datetime, json, os, re, sys, time, urllib.error, urllib.request

SITE = os.environ.get('CRADLE_SITE_URL', '').strip().rstrip('/')
API = os.environ.get('CRADLE_GITHUB_API', 'https://api.github.com').rstrip('/')
REPO = os.environ.get('GITHUB_REPOSITORY') or os.environ.get('CRADLE_GITHUB_REPO', '')
UA = {'User-Agent': 'cradle-monitor'}
results = []


def check(name, ok, detail):
    results.append((name, ok, detail))
    print(('PASS' if ok else 'FAIL') + '  ' + name + ' | ' + detail, flush=True)


def fetch(url, data=None, headers=None, timeout=20):
    req = urllib.request.Request(url, data=data, headers={**UA, **(headers or {})})
    t = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
        return r.status, body, round((time.time() - t) * 1000)


def parse_time(s):
    return datetime.datetime.fromisoformat(str(s).replace('Z', '+00:00'))


def main():
    if not re.match(r'^https?://[^\s/]+$', SITE):
        print('Set CRADLE_SITE_URL to your Cradle address, like https://your-cradle.netlify.app '
              '(in GitHub: Settings > Secrets and variables > Actions > Variables).')
        return 2
    now = datetime.datetime.now(datetime.timezone.utc)

    try:
        code, body, ms = fetch(SITE + '/')
        check('Site loads', code == 200 and b'Cradle' in body, f'HTTP {code} in {ms} ms')
    except Exception as e:
        check('Site loads', False, str(e))

    live = {}
    try:
        code, body, ms = fetch(SITE + '/version.json?monitor=' + str(int(time.time())))
        live = json.loads(body)
        check('Deployed version', code == 200 and bool(live.get('version')),
              f"v{live.get('version')} ({str(live.get('commit', ''))[:7] or 'no commit'}), built {live.get('built_at')}")
    except Exception as e:
        check('Deployed version', False, str(e))

    cfg = {}
    try:
        code, body, _ = fetch(SITE + '/status/')
        m = re.search(rb'<script type="application/json" id="statusConfig">(.*?)</script>', body, re.S)
        cfg = json.loads(m.group(1)) if m else {}
    except Exception as e:
        check('Status page', False, str(e))
    if cfg.get('url') and cfg.get('key'):
        try:
            code, body, ms = fetch(cfg['url'] + '/rest/v1/rpc/cradle_status', data=b'{}',
                                   headers={'apikey': cfg['key'], 'Content-Type': 'application/json'})
            st = json.loads(body)
            check('Database answers', code == 200, f'HTTP {code} in {ms} ms')
            up = st.get('uptime') or {}
            if up.get('site'):
                last = up.get('last')
                age = (now - parse_time(last['at'])).total_seconds() / 60 if last else None
                check('Uptime checks running', age is not None and age < 20,
                      f'last check {age:.0f} min ago' if age is not None else 'no checks recorded yet')
            if 'cradle-notify' in (st.get('jobs') or []):
                n = st.get('notify') or {}
                runs, good = n.get('runs') or 0, n.get('ok') or 0
                check('Notification job', runs > 0 and good / runs >= 0.9, f'{good} of {runs} runs OK in 24 h')
            o = st.get('owlet')
            if o and (o.get('connected') or 0) > 0:
                last = o.get('last_ok')
                age = (now - parse_time(last)).total_seconds() / 60 if last else None
                problems = []
                if 'cradle-owlet' not in (st.get('jobs') or []):
                    problems.append('schedule missing (run 8-owlet-schedule.sql)')
                if o.get('stale'):
                    problems.append(f"{o['stale']} not read in 10+ min")
                if o.get('reconnect'):
                    problems.append(f"{o['reconnect']} need connecting again")
                paused = f"; {o['paused']} paused (family stopped requiring two-step sign-in)" if o.get('paused') else ''
                check('Owlet checks', not problems,
                      ('; '.join(problems) if problems else f"{o['connected']} connected, last reading {age:.0f} min ago" if age is not None else 'connected') + paused)
        except urllib.error.HTTPError as e:
            check('Database answers', e.code == 404, f'HTTP {e.code}' + (' (5-status.sql not run; skipped)' if e.code == 404 else ''))
        except Exception as e:
            check('Database answers', False, str(e))
    elif cfg:
        check('Database answers', True, 'site built without database settings; skipped')

    if REPO and live.get('commit'):
        try:
            _, body, _ = fetch(f'{API}/repos/{REPO}/commits/main', headers={'Accept': 'application/vnd.github+json'})
            head = json.loads(body)['sha']
            if head == live['commit']:
                check('Deploy up to date', True, f'main {head[:7]} is live')
            else:
                _, body, _ = fetch(f'{API}/repos/{REPO}/commits/{head}/check-runs?check_name=test',
                                   headers={'Accept': 'application/vnd.github+json'})
                runs = [r for r in json.loads(body).get('check_runs', []) if r.get('conclusion') == 'success']
                if not runs:
                    check('Deploy up to date', True, f'main {head[:7]} hasn\'t passed its tests, so {live["commit"][:7]} stays live (as designed)')
                else:
                    waited = (now - parse_time(runs[0]['completed_at'])).total_seconds() / 60
                    check('Deploy up to date', waited < 45, f'main {head[:7]} passed its tests {waited:.0f} min ago but {live["commit"][:7]} is live')
        except Exception as e:  # GitHub trouble isn't Cradle being down
            check('Deploy up to date', True, f'couldn\'t ask GitHub ({e}); skipped')

    bad = [r for r in results if not r[1]]
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a') as f:
            f.write(f"### Cradle: {'all checks passed' if not bad else str(len(bad)) + ' failed'}\n\n| Check | Result | Detail |\n|---|---|---|\n")
            for n, ok, d in results:
                f.write(f"| {n} | {'✅' if ok else '❌'} | {d} |\n")
    print(('All ' + str(len(results)) + ' checks passed') if not bad else (str(len(bad)) + ' of ' + str(len(results)) + ' checks failed'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
