#!/usr/bin/env python3
"""Builds the short meanings Daily Word shows after a game, and writes them into cradle.html.

The meanings come from WordNet 3.1 (Princeton University), as packaged by the npm module
wordnet-db 3.1.14. See THIRD-PARTY-NOTICES.md for WordNet's license.

    mkdir -p /tmp/wn && cd /tmp/wn && npm pack wordnet-db@3.1.14 && tar xzf wordnet-db-3.1.14.tgz
    python3 tools/words/build_meanings.py /tmp/wn/package/dict

For every answer word in the wordData block (run build_words.py first if the lists change):
- up to two meanings: the most common sense of the word's most common part of speech, then the
  most common sense of the next part of speech it's used as (if WordNet has it tagged in use);
- each definition cut to about 90 characters (examples are left out: they make the page much bigger,
  and some of WordNet's are grim);
- short words WordNet leaves out (pronouns, prepositions, helper verbs) have meanings written for
  Cradle in MANUAL;
- a word WordNet doesn't have under its own spelling is tried as a plural, past tense, -ing form,
  or comparative of a word it does have (shown as "past tense of fly"), and failing that it simply
  has no meaning (the app then offers only the dictionary link).

Output: a wordMeans block, {"word": "nmeaning|vmeaning", ...}: each meaning starts with one letter
for its part of speech, n (noun), v (verb), a (adjective) or r (other: adverb, preposition, and so on).
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, '..', '..', 'cradle.html')
FILES = {'n': 'noun', 'v': 'verb', 'a': 'adj', 'r': 'adv'}
MAX_DEF = 90       # characters; longer definitions are cut at a comma or semicolon before this

# Irregular forms that are answers (WordNet's exception lists aren't in the package)
IRREGULAR = {
    'flew': ('fly', 'past tense of'), 'drew': ('draw', 'past tense of'), 'grew': ('grow', 'past tense of'),
    'knew': ('know', 'past tense of'), 'threw': ('throw', 'past tense of'), 'blew': ('blow', 'past tense of'),
    'slew': ('slay', 'past tense of'), 'chose': ('choose', 'past tense of'), 'froze': ('freeze', 'past tense of'),
    'spoke': ('speak', 'past tense of'), 'broke': ('break', 'past tense of'), 'woke': ('wake', 'past tense of'),
    'stole': ('steal', 'past tense of'), 'drove': ('drive', 'past tense of'), 'wrote': ('write', 'past tense of'),
    'rode': ('ride', 'past tense of'), 'rose': ('rise', 'past tense of'), 'shook': ('shake', 'past tense of'),
    'took': ('take', 'past tense of'), 'stood': ('stand', 'past tense of'), 'began': ('begin', 'past tense of'),
    'sang': ('sing', 'past tense of'), 'swam': ('swim', 'past tense of'), 'drank': ('drink', 'past tense of'),
    'sank': ('sink', 'past tense of'), 'rang': ('ring', 'past tense of'), 'gave': ('give', 'past tense of'),
    'came': ('come', 'past tense of'), 'became': ('become', 'past tense of'), 'forgot': ('forget', 'past tense of'),
    'fought': ('fight', 'past tense of'), 'taught': ('teach', 'past tense of'), 'caught': ('catch', 'past tense of'),
    'bought': ('buy', 'past tense of'), 'brought': ('bring', 'past tense of'), 'thought': ('think', 'past tense of'),
    'sought': ('seek', 'past tense of'), 'built': ('build', 'past tense of'), 'spent': ('spend', 'past tense of'),
    'sent': ('send', 'past tense of'), 'lent': ('lend', 'past tense of'), 'meant': ('mean', 'past tense of'),
    'felt': ('feel', 'past tense of'), 'dealt': ('deal', 'past tense of'), 'slept': ('sleep', 'past tense of'),
    'swept': ('sweep', 'past tense of'), 'wept': ('weep', 'past tense of'), 'kept': ('keep', 'past tense of'),
    'knelt': ('kneel', 'past tense of'), 'held': ('hold', 'past tense of'), 'told': ('tell', 'past tense of'),
    'sold': ('sell', 'past tense of'), 'found': ('find', 'past tense of'), 'bound': ('bind', 'past tense of'),
    'wound': ('wind', 'past tense of'), 'ground': ('grind', 'past tense of'), 'struck': ('strike', 'past tense of'),
    'stuck': ('stick', 'past tense of'), 'clung': ('cling', 'past tense of'), 'flung': ('fling', 'past tense of'),
    'swung': ('swing', 'past tense of'), 'stung': ('sting', 'past tense of'), 'hung': ('hang', 'past tense of'),
    'spun': ('spin', 'past tense of'), 'won': ('win', 'past tense of'), 'ate': ('eat', 'past tense of'),
    'fell': ('fall', 'past tense of'), 'shone': ('shine', 'past tense of'), 'wore': ('wear', 'past tense of'),
    'tore': ('tear', 'past tense of'), 'swore': ('swear', 'past tense of'), 'bore': ('bear', 'past tense of'),
    'hid': ('hide', 'past tense of'), 'slid': ('slide', 'past tense of'), 'bitten': ('bite', 'past participle of'),
    'hidden': ('hide', 'past participle of'), 'chosen': ('choose', 'past participle of'),
    'frozen': ('freeze', 'past participle of'), 'spoken': ('speak', 'past participle of'),
    'broken': ('break', 'past participle of'), 'stolen': ('steal', 'past participle of'),
    'driven': ('drive', 'past participle of'), 'written': ('write', 'past participle of'),
    'ridden': ('ride', 'past participle of'), 'risen': ('rise', 'past participle of'),
    'shaken': ('shake', 'past participle of'), 'taken': ('take', 'past participle of'),
    'given': ('give', 'past participle of'), 'fallen': ('fall', 'past participle of'),
    'woken': ('wake', 'past participle of'), 'worn': ('wear', 'past participle of'), 'torn': ('tear', 'past participle of'),
    'sworn': ('swear', 'past participle of'), 'grown': ('grow', 'past participle of'), 'known': ('know', 'past participle of'),
    'thrown': ('throw', 'past participle of'), 'blown': ('blow', 'past participle of'), 'drawn': ('draw', 'past participle of'),
    'flown': ('fly', 'past participle of'), 'shown': ('show', 'past participle of'), 'sewn': ('sew', 'past participle of'),
    'begun': ('begin', 'past participle of'), 'sung': ('sing', 'past participle of'), 'drunk': ('drink', 'past participle of'),
    'sunk': ('sink', 'past participle of'), 'rung': ('ring', 'past participle of'), 'gotten': ('get', 'past participle of'),
    'mice': ('mouse', 'plural of'), 'geese': ('goose', 'plural of'), 'teeth': ('tooth', 'plural of'),
    'feet': ('foot', 'plural of'), 'women': ('woman', 'plural of'), 'oxen': ('ox', 'plural of'),
    'better': ('good', 'comparative of'), 'worse': ('bad', 'comparative of'),
    'arisen': ('arise', 'past participle of'), 'arose': ('arise', 'past tense of'), 'awoke': ('awake', 'past tense of'),
    'awoken': ('awake', 'past participle of'), 'befell': ('befall', 'past tense of'), 'beheld': ('behold', 'past tense of'),
    'bidden': ('bid', 'past participle of'), 'bled': ('bleed', 'past tense of'), 'borne': ('bear', 'past participle of'),
    'crept': ('creep', 'past tense of'), 'dwelt': ('dwell', 'past tense of'), 'eaten': ('eat', 'past participle of'),
    'lain': ('lie', 'past participle of'), 'misled': ('mislead', 'past tense of'), 'outdid': ('outdo', 'past tense of'),
    'outran': ('outrun', 'past tense of'), 'redid': ('redo', 'past tense of'), 'redone': ('redo', 'past participle of'),
    'relaid': ('relay', 'past tense of'), 'remade': ('remake', 'past tense of'), 'repaid': ('repay', 'past tense of'),
    'seen': ('see', 'past participle of'), 'shrank': ('shrink', 'past tense of'), 'shrunk': ('shrink', 'past participle of'),
    'slung': ('sling', 'past tense of'), 'slunk': ('slink', 'past tense of'), 'smote': ('smite', 'past tense of'),
    'sped': ('speed', 'past tense of'), 'sprang': ('spring', 'past tense of'), 'sprung': ('spring', 'past participle of'),
    'stank': ('stink', 'past tense of'), 'strewn': ('strew', 'past participle of'), 'strode': ('stride', 'past tense of'),
    'strove': ('strive', 'past tense of'), 'stunk': ('stink', 'past participle of'), 'swum': ('swim', 'past participle of'),
    'trod': ('tread', 'past tense of'), 'undid': ('undo', 'past tense of'), 'upheld': ('uphold', 'past tense of'),
    'went': ('go', 'past tense of'), 'wove': ('weave', 'past tense of'), 'wrung': ('wring', 'past tense of'),
    'cacti': ('cactus', 'plural of'), 'crises': ('crisis', 'plural of'), 'genera': ('genus', 'plural of'),
    'hooves': ('hoof', 'plural of'), 'larvae': ('larva', 'plural of'), 'laymen': ('layman', 'plural of'),
    'lice': ('louse', 'plural of'), 'loaves': ('loaf', 'plural of'), 'madmen': ('madman', 'plural of'),
    'maxima': ('maximum', 'plural of'), 'nuclei': ('nucleus', 'plural of'), 'optima': ('optimum', 'plural of'),
    'papyri': ('papyrus', 'plural of'), 'radii': ('radius', 'plural of'), 'seamen': ('seaman', 'plural of'),
    'selves': ('self', 'plural of'), 'strata': ('stratum', 'plural of'), 'uteri': ('uterus', 'plural of'),
    'wolves': ('wolf', 'plural of'), 'gunmen': ('gunman', 'plural of'), 'fezzes': ('fez', 'plural of'),
    'eave': ('eaves', 'singular of'), 'bred': ('breed', 'past tense of'), 'fled': ('flee', 'past tense of'),
    'genii': ('genius', 'plural of'), 'beeves': ('beef', 'plural of'),
    'fatter': ('fat', 'comparative of'), 'hotter': ('hot', 'comparative of'), 'sadder': ('sad', 'comparative of'),
    'hipper': ('hip', 'comparative of'), 'gooier': ('gooey', 'comparative of'),
}

# Short words WordNet leaves out (pronouns, prepositions, helper verbs, exclamations), written for Cradle
MANUAL = {
    'ahoy': 'r a call used to hail a ship or get someone’s attention', 'albeit': 'r even though; although',
    'amid': 'r in the middle of; surrounded by', 'among': 'r in the middle of a group; shared between several',
    'anyone': 'n any person at all', 'beside': 'r next to; at the side of', 'been': 'v past participle of be',
    'cannot': 'v can not; is unable to', 'circa': 'r about; used before an approximate date, like circa 1900',
    'could': 'v past tense of can; also used for what is possible', 'during': 'r throughout, or at some point in, a period of time',
    'else': 'r other; in addition, as in someone else', 'from': 'r showing where something starts or comes from',
    'gosh': 'r a mild exclamation of surprise', 'into': 'r toward the inside of; changing to',
    'itself': 'n the thing itself, used for emphasis or after a verb', 'myself': 'n me, used for emphasis or after a verb',
    'onto': 'r to a position on top of', 'ouch': 'r a cry of sudden pain', 'ought': 'v should; used for what is right or expected',
    'shall': 'v will; used for the future or for what must happen', 'should': 'v used for what is right, advisable, or expected',
    'since': 'r from a past time until now; because', 'than': 'r used to compare, as in taller than you',
    'that': 'n the one there, or the one already mentioned', 'their': 'n belonging to them', 'them': 'n those people or things',
    'these': 'n the ones here', 'they': 'n those people or things', 'this': 'n the one here, or the one just mentioned',
    'those': 'n the ones there', 'toward': 'r in the direction of', 'unless': 'r except if',
    'until': 'r up to the time that', 'unto': 'r to (old-fashioned)', 'upon': 'r on; on top of',
    'versus': 'r against, as in one team versus another', 'were': 'v past tense of be, for you, we, and they',
    'what': 'n which thing; the thing that', 'when': 'r at what time; at the time that', 'where': 'r in or to what place',
    'which': 'n what one, from a known set', 'whilst': 'r while', 'whoa': 'r a call to stop or slow down; wow',
    'whom': 'n who, after a verb or preposition', 'whose': 'n belonging to which person',
    'with': 'r together with; using', 'would': 'v past tense of will; used for what might happen',
    'your': 'n belonging to you', 'whew': 'r a sound of relief or amazement', 'yuck': 'r an exclamation of disgust',
    'media': 'n newspapers, TV, radio, and websites as a whole; plural of medium', 'monies': 'n sums of money',
    'multi': 'a many; more than one', 'pence': 'n plural of penny (British)', 'psych': 'v to get excited or ready, as in psych up',
    'vying': 'v competing for something', 'fiddly': 'a fussy and awkward to do, needing careful small movements',
    'termly': 'a happening once a school term', 'sweaty': 'a damp with sweat',
    'redraw': 'v to draw again', 'retype': 'v to type again', 'funner': 'a more fun (informal)',
    'amoral': 'a without any sense of right and wrong', 'dunno': 'v don’t know (informal)',
    'gimme': 'v give me (informal)', 'betcha': 'v bet you (informal)', 'sorta': 'r sort of; somewhat (informal)',
    'badder': 'a more bad (informal)', 'unset': 'a not yet set or fixed', 'tong': 'v to grab or lift with tongs',
}


def load_index(d):
    """word -> {pos: (tagged_sense_count, [offsets])}"""
    idx = {}
    for pos, name in FILES.items():
        with open(os.path.join(d, 'index.' + name), encoding='utf-8') as f:
            for line in f:
                if line.startswith(' '):
                    continue
                p = line.split()
                lemma, n_syn, n_ptr = p[0], int(p[2]), int(p[3])
                tagged = int(p[5 + n_ptr])
                offsets = p[6 + n_ptr:6 + n_ptr + n_syn]
                idx.setdefault(lemma, {})[pos] = (tagged, offsets)
    return idx


def gloss(d, pos, offset, cache={}):
    name = FILES[pos]
    if name not in cache:
        cache[name] = open(os.path.join(d, 'data.' + name), 'rb')
    f = cache[name]
    f.seek(int(offset))
    line = f.readline().decode('utf-8')
    g = line.split(' | ', 1)[1].strip()
    parts = [x.strip() for x in g.split(';')]
    defs = [x for x in parts if not x.startswith('"')]
    return defs[0] if defs else ''


def shorten(s, n):
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s*\((?:usually|often|sometimes)[^)]*\)\s*$', '', s)   # trailing usage notes
    if len(s) <= n:
        return s
    cut = max(s.rfind(', ', 0, n), s.rfind('; ', 0, n))
    return (s[:cut] if cut > n // 2 else s[:n].rsplit(' ', 1)[0]) + '…'


# The part of speech an inflection comes from (so "hipper" is the adjective hip, not the body part)
NOTE_POS = {'plural of': 'n', 'singular of': 'n', 'past tense of': 'v', 'past participle of': 'v',
            '-ing form of': 'v', 'comparative of': 'a', 'superlative of': 'a'}


def senses(d, idx, w, only=None):
    """[[pos, definition], ...] for a lemma, most common first (up to two parts of speech).
    With only, just the most common sense in that part of speech."""
    entry = idx.get(w)
    if not entry:
        return []
    if only:
        if only not in entry:
            return []
        definition = gloss(d, only, entry[only][1][0])
        return [[only, shorten(definition, MAX_DEF)]] if definition else []
    order = sorted(entry.items(), key=lambda kv: (-kv[1][0], 'nvar'.index(kv[0])))
    out = []
    for i, (pos, (tagged, offs)) in enumerate(order[:2]):
        if i == 1 and tagged == 0:
            break
        definition = gloss(d, pos, offs[0])
        if definition:
            out.append([pos, shorten(definition, MAX_DEF)])
    return out


def base_forms(w, idx):
    """(base, note) candidates for a regular inflection WordNet doesn't list under its own spelling."""
    c = []
    if w.endswith('ies'):
        c.append((w[:-3] + 'y', 'plural of'))
    if w.endswith('es'):
        c.append((w[:-2], 'plural of'))
    if w.endswith('s') and not w.endswith('ss'):
        c.append((w[:-1], 'plural of'))
    if w.endswith('ied'):
        c.append((w[:-3] + 'y', 'past tense of'))
    if w.endswith('ed'):
        c += [(w[:-2], 'past tense of'), (w[:-1], 'past tense of')]
        if len(w) > 4 and w[-3] == w[-4]:
            c.append((w[:-3], 'past tense of'))
    if w.endswith('ing'):
        c += [(w[:-3], '-ing form of'), (w[:-3] + 'e', '-ing form of')]
    if w.endswith('ier'):
        c.append((w[:-3] + 'y', 'comparative of'))
    if w.endswith('er'):
        c += [(w[:-2], 'comparative of'), (w[:-1], 'comparative of')]
    if w.endswith('est'):
        c += [(w[:-3], 'superlative of'), (w[:-2], 'superlative of')]
    return [(b, n) for b, n in c if b in idx]


def answers_from_app():
    html = open(APP, encoding='utf-8').read()
    m = re.search(r'<script type="application/json" id="wordData">(.*?)</script>', html, re.S)
    data = json.loads(m.group(1))
    words = []
    for n, a in data['a'].items():
        words += [a[i:i + int(n)] for i in range(0, len(a), int(n))]
    return words


def main(d):
    idx = load_index(d)
    out, missing = {}, []
    for w in answers_from_app():
        s = senses(d, idx, w)
        if not s and w in IRREGULAR and IRREGULAR[w][0] in idx:
            base, note = IRREGULAR[w]
            s = [[p, f'{note} {base}: {x}'] for p, x in senses(d, idx, base, NOTE_POS.get(note))[:1]]
        if not s and w in MANUAL:
            s = [[MANUAL[w][0], MANUAL[w][2:]]]
        if not s:
            for base, note in base_forms(w, idx):
                s = [[p, f'{note} {base}: {x}'] for p, x in senses(d, idx, base, NOTE_POS.get(note))[:1]]
                if s:
                    break
        if s:
            out[w] = '|'.join(p + x for p, x in s)
        else:
            missing.append(w)
    blob = json.dumps(out, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
    html = open(APP, encoding='utf-8').read()
    tag = '<script type="application/json" id="wordMeans">'
    if tag not in html:
        sys.exit('cradle.html has no wordMeans block')
    html = re.sub(re.escape(tag) + r'.*?</script>', lambda _m: tag + blob + '</script>', html, count=1, flags=re.S)
    open(APP, 'w', encoding='utf-8').write(html)
    print(f'{len(out)} words with a meaning, {len(missing)} without: {" ".join(sorted(missing))}')
    print(f'wrote {len(blob.encode()):,} bytes of meanings into cradle.html')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
