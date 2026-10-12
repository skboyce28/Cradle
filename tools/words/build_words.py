#!/usr/bin/env python3
"""Builds the word lists for Daily Word and writes them into cradle.html.

The words come from SCOWL (http://wordlist.aspell.net/), as packaged by the npm module
wordlist-english 1.2.1. See THIRD-PARTY-NOTICES.md for SCOWL's copyright notice.

    mkdir -p /tmp/wl && cd /tmp/wl && npm pack wordlist-english@1.2.1 && tar xzf wordlist-english-1.2.1.tgz
    python3 tools/words/build_words.py /tmp/wl/package

Two lists for each length (4, 5 and 6 letters):
- answers: common words (SCOWL levels 10 to 35) without plurals, past tenses, -ing forms,
  or anything rude or grim. Shuffled once with a fixed seed. The daily word is
  answers[day number % count], so the order must never change: to add words later,
  append them at the end (the script keeps the existing order from cradle.html).
- guesses: every word you're allowed to type (SCOWL levels 10 to 70), minus slurs.
"""
import json, os, random, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..', '..', 'cradle.html')
LEVELS_ANSWER = [10, 20, 35]
LEVELS_GUESS = [10, 20, 35, 40, 50, 55, 60, 70]
LENGTHS = [4, 5, 6]
SEED = 20261012

# Never in either list: slurs and the crudest words
BLOCK_ALL = set('''
nigga nigger niggas negro negroes spic spick spics kike kikes chink chinks gook gooks wop wops
dago dagos coon coons kraut fag fags faggot faggy dyke dykes homo homos queer tranny wetback
retard retards spaz spastic gimp cunt cunts twat twats cock cocks dick dicks prick pricks
pussy fuck fucks fucked fucker fucky shit shits shitty piss pissed bitch slut sluts whore
whores wank wanks wanker jizz cum cums dildo dildos porn porno porns tits titty boob boobs
'''.split())

# Not chosen as the daily word (still fine to type as a guess): rude, adult, violent, or grim
BLOCK_ANSWER = BLOCK_ALL | set('''
anal anus arse arses ass asses butt butts crap craps damn damned hell hells bloody bugger
balls bonk booze boozy drunk drunks horny kinky naked nude nudes orgy pervy pimp pimps
rape raped rapes rapist semen sex sexes sexy sperm stripper vagina penis penile
pubic pube pubes scrotum testes thong thongs bra bras panty enema feces fecal fart farts
puke pukes vomit vomits snot turd turds poop poops pee pees urine bowel bowels
kill kills killer killed murder murders dead death deaths die dies died dying corpse corpses
coffin coffins grave graves gravely funeral bury buried burial tomb tombs suicide slay slain
stab stabs stabbed gun guns rifle rifles pistol bomb bombs bomber
knife knives sword swords hang hangs hanged noose drown drowns drowned choke choked strangle
abuse abused abuser assault victim victims torture tortures cancer tumor tumour tumors
illness disease plague plagues ebola virus viruses fever fevers sick sicker sickly ill
wound wounds wounded bleed bleeds blood bloods bleeding injury injure injured
grief grieve grieved mourn mourns mourning widow widows widower orphan orphans sorrow
divorce abort aborts abortion miscarry lethal fatal toxic poison poisons overdose
crime crimes thief thieves rob robs robbed robber jail jails prison prisons arrest
war wars terror terrors hostage riot riots enemy enemies weapon weapons slave slaves
nazi nazis racist racism hate hates hated hatred satan devil devils demon demons evil
bawdy cyst cysts sodomy lusty lust lusts lewd erotic sexual sexist harlot hussy bimbo tramp gore gory maim maimed
thee thou thy hove lemme gonna gotta wanna octal bitmap lambda debug
idiot idiots moron morons stupid dumb dumber dumbest ugly uglier fatso obese loser losers
'''.split())

VOWELISH = set('aeiouy')


def load(pkg, levels, lengths=LENGTHS):
    words = set()
    for lv in levels:
        for dialect in ('english', 'american'):
            path = os.path.join(pkg, f'{dialect}-words-{lv}.json')
            with open(path) as f:
                words.update(json.load(f))
    return {w for w in words if re.fullmatch(r'[a-z]+', w) and (lengths is None or len(w) in lengths)}


def inflected(w, every):
    """True for plurals, past tenses, -ing forms and similar (so answers are base words)."""
    if w.endswith('ss') or w.endswith('us') or w.endswith('is'):
        return False
    if w.endswith('s') and (w[:-1] in every or (w.endswith('es') and w[:-2] in every)
                            or (w.endswith('ies') and w[:-3] + 'y' in every)):
        return True
    if w.endswith('ed') and (w[:-2] in every or w[:-1] in every or (len(w) > 4 and w[-3] == w[-4] and w[:-3] in every)
                             or (w.endswith('ied') and w[:-3] + 'y' in every)):
        return True
    if w.endswith('ing') and (w[:-3] in every or w[:-3] + 'e' in every or (len(w) > 5 and w[-4] == w[-5] and w[:-4] in every)):
        return True
    if w.endswith('er') and (w[:-2] in every or w[:-1] in every):
        return True  # comparatives like "older", "safer" (also drops a few nouns like "tanker")
    if (w.endswith('ier') and w[:-3] + 'y' in every) or (w.endswith('iest') and w[:-4] + 'y' in every):
        return True
    if w.endswith('est') and (w[:-3] in every or w[:-2] in every):
        return True
    return False


def existing_answers():
    try:
        html = open(APP, encoding='utf-8').read()
        m = re.search(r'<script type="application/json" id="wordData">(.*?)</script>', html, re.S)
        if not m:
            return {}
        data = json.loads(m.group(1))
        return {int(n): [a[i:i + int(n)] for i in range(0, len(a), int(n))] for n, a in data['a'].items()}
    except (OSError, ValueError, KeyError):
        return {}


def main(pkg):
    every = load(pkg, LEVELS_GUESS)
    allwords = load(pkg, LEVELS_GUESS, None)                   # every length, for spotting plurals of short words
    common = load(pkg, LEVELS_ANSWER)
    rng = random.Random(SEED)
    old = existing_answers()
    out = {'a': {}, 'g': {}}
    for n in LENGTHS:
        answers = sorted(w for w in common if len(w) == n and w not in BLOCK_ANSWER
                         and not inflected(w, allwords) and set(w) & VOWELISH)
        guesses = sorted(w for w in every if len(w) == n and w not in BLOCK_ALL)
        keep = [w for w in old.get(n, []) if w in answers]     # never reorder published dailies
        new = [w for w in answers if w not in set(keep)]
        rng.shuffle(new)
        final = keep + new if keep else new
        extra = sorted(set(guesses) - set(final))              # answers are always valid guesses too
        out['a'][str(n)] = ''.join(final)
        out['g'][str(n)] = ''.join(extra)
        print(f'{n} letters: {len(final)} answers, {len(final) + len(extra)} allowed guesses')
    blob = json.dumps(out, separators=(',', ':'))
    html = open(APP, encoding='utf-8').read()
    tag = '<script type="application/json" id="wordData">'
    if tag not in html:
        sys.exit('cradle.html has no wordData block')
    html = re.sub(re.escape(tag) + r'.*?</script>', lambda _m: tag + blob + '</script>', html, count=1, flags=re.S)
    open(APP, 'w', encoding='utf-8').write(html)
    print(f'wrote {len(blob):,} bytes of words into cradle.html')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
