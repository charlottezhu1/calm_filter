/*
 * SentiStrength (English, default configuration) in plain JavaScript.
 *
 * Port of the scoring classes in uk.ac.wlv.sentistrength (Sentence, Term,
 * Paragraph, and the word-list loaders), with the options fixed at the
 * defaults of the SentiStrength Java program. Features that are
 * off by default (keywords, lemmatisation, trinary/scale/average/total
 * modes, object-evaluation table, question handling, capitals boost,
 * negation after sentiment) are not ported.
 *
 * score(text) -> { positive: 1..5, negative: -5..-1 }
 *
 * Java quirks are kept on purpose so results match the jar:
 *  - word lists are sorted with the same quicksort and searched with the same
 *    windowed binary search (wildcard stems are only found near the insert point)
 *  - sentiment values are float32
 *  - chars are UTF-16 code units
 *
 * Needs SENTISTRENGTH_DATA (sentistrength_data.js: the SentiStrength English October 2019
 * word lists, packed by analysis/tests/build_ss_data.js).
 */
(function (root) {
  'use strict';

  var f32 = Math.fround;

  // ---------- Java-compatible helpers ----------

  var LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;
  var LETTER = /\p{L}/u;

  function javaTrim(s) {
    return s.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
  }

  // Java String.split: trailing empty strings are dropped.
  function javaSplit(s, sep) {
    var parts = s.split(sep);
    while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    return parts;
  }

  // Integer.parseInt, or null on NumberFormatException.
  function javaInt(s) {
    return /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : null;
  }

  function lines(text) {
    return text.split(/\r\n|\r|\n/);
  }

  // Character.toLowerCase(Character.toUpperCase(c)) for one UTF-16 unit.
  function foldChar(c) {
    var u = c.toUpperCase();
    if (u.length !== 1) u = c;
    var l = u.toLowerCase();
    return l.length === 1 ? l : u;
  }

  // ---------- Java sort / search (1-based arrays) ----------

  function quickSortStringsWithInt(keys, vals, l, r) {
    var mid = keys[(l + r) >> 1];
    var i = l;
    var j = r;
    while (i <= j) {
      while (mid > keys[i] && i < r) i++;
      while (mid < keys[j] && j > l) j--;
      if (i < j) {
        var k = keys[i]; keys[i] = keys[j]; keys[j] = k;
        var v = vals[i]; vals[i] = vals[j]; vals[j] = v;
      }
      if (i > j) continue;
      i++;
      j--;
    }
    if (l < j) quickSortStringsWithInt(keys, vals, l, j);
    if (i < r) quickSortStringsWithInt(keys, vals, i, r);
  }

  function findExact(text, arr, lower, upper) {
    while (upper - lower > 2) {
      var m = (lower + upper) >> 1;
      if (text < arr[m]) upper = m; else lower = m;
    }
    for (var i = lower; i <= upper; i++) {
      if (arr[i] === text) return i;
    }
    return -1;
  }

  function findWithWildcards(text, arr, lower, upper) {
    var origLower = lower;
    var origUpper = upper;
    while (upper - lower > 2) {
      var m = (lower + upper) >> 1;
      if (text < arr[m]) upper = m; else lower = m;
    }
    var i;
    for (i = upper; i >= lower; i--) {
      if (arr[i] === text) return i;
    }
    if (lower > origLower) lower--;
    if (lower > origLower) lower--;
    if (lower > origLower) lower--;
    if (upper < origUpper) upper++;
    var textLen = text.length;
    for (i = upper; i >= lower; i--) {
      var len = arr[i].length;
      if (len > 1 && arr[i].charAt(len - 1) === '*' && textLen >= len - 1 &&
          text.substring(0, len - 1) === arr[i].substring(0, len - 1)) {
        return i;
      }
    }
    return -1;
  }

  // ---------- Word lists ----------

  // Tab-separated "key<TAB>int[<TAB>comment]" files, sorted by key.
  function loadKeyedList(fileText, opts) {
    var keys = [null];
    var vals = [0];
    lines(fileText).forEach(function (line) {
      var t1 = line.indexOf('\t');
      if (t1 < 0) return;
      var t2 = line.indexOf('\t', t1 + 1);
      var raw = t2 > 0 ? line.substring(t1 + 1, t2) : line.substring(t1 + 1);
      var n = javaInt(opts.trimWeight || t2 <= 0 ? javaTrim(raw) : raw);
      if (n === null) n = 0;
      var key = line.substring(0, t1);
      if (key.indexOf(' ') >= 0) key = javaTrim(key);
      if (key === '') return;
      keys.push(key);
      vals.push(opts.shift ? (n > 0 ? n - 1 : n < 0 ? n + 1 : 0) : n);
    });
    return { keys: keys, vals: vals, count: keys.length - 1 };
  }

  function sortedList(list) {
    if (list.count > 0) quickSortStringsWithInt(list.keys, list.vals, 1, list.count);
    return list;
  }

  function buildResources(data) {
    var sentiment = sortedList(loadKeyedList(data.sentiment, { shift: true, trimWeight: true }));
    var booster = sortedList(loadKeyedList(data.booster, {}));

    var emoticons = { keys: [null], vals: [0], count: 0 };
    lines(data.emoticons).forEach(function (line) {
      var parts = javaSplit(line, '\t');
      if (parts.length <= 1) return;
      var n = javaInt(javaTrim(parts[1]));
      if (n === null) return;
      emoticons.keys.push(parts[0]);
      emoticons.vals.push(n);
      emoticons.count++;
    });
    if (emoticons.count > 1) quickSortStringsWithInt(emoticons.keys, emoticons.vals, 1, emoticons.count);

    // Idioms stay in file order. Strength is shifted one step toward zero.
    var idioms = [];
    lines(data.idioms).forEach(function (line) {
      var t1 = line.indexOf('\t');
      if (t1 < 0) return;
      var t2 = line.indexOf('\t', t1 + 1);
      var n = javaInt(javaTrim(t2 > 0 ? line.substring(t1 + 1, t2) : line.substring(t1 + 1)));
      n = n === null ? 0 : n > 0 ? n - 1 : n < 0 ? n + 1 : 0;
      var text = line.substring(0, t1);
      if (text.indexOf(' ') >= 0) text = javaTrim(text);
      if (text.indexOf('  ') > 0) text = text.split('  ').join(' ');
      if (text.indexOf('  ') > 0) text = text.split('  ').join(' ');
      if (text === '') return;
      idioms.push({ words: javaSplit(text, ' '), strength: n });
    });

    function toSet(fileText, firstColumnOnly) {
      var set = new Set();
      lines(fileText).forEach(function (line) {
        if (line === '') return;
        set.add(firstColumnOnly ? line.split('\t')[0] : line);
      });
      return set;
    }

    return {
      sentiment: sentiment,
      booster: booster,
      emoticons: emoticons,
      idioms: idioms,
      negating: toSet(data.negating, false),
      irony: toSet(data.irony, true),
      dictionary: toSet(data.dictionary, false)
    };
  }

  // ---------- Options (SentiStrength defaults) ----------

  var ILLEGAL_DOUBLE_MIDDLE = 'ahijkquvxyz';
  var ILLEGAL_DOUBLE_END = 'achijkmnpqruvwxyz';
  var MIN_REPEATED_LETTERS_FOR_BOOST = 2;
  var NEGATED_WORD_MULTIPLIER = 0.5;
  var MIN_POS_FOR_IRONY = 10;

  var TYPE_WORD = 1;
  var TYPE_PUNCTUATION = 2;
  var TYPE_EMOTICON = 3;

  // ---------- Term ----------

  function Term(res) {
    this.res = res;
    this.type = 0;
    this.original = '';
    this.translated = '';
    this.emphasis = '';
    this.punct = '';
    this.punctEmphasis = '';
    this.emoticon = '';
    this.emoStrength = 0;
    this.override = null;
    this._lcase = '';
    this._booster = null;
    this._negating = null;
    this._sentiment = null;
    this._properNoun = null;
  }

  // Reads one word, punctuation run or emoticon from the start of segment.
  // Returns the number of chars consumed, or -1 if the whole segment was used.
  Term.prototype.extract = function (segment) {
    var emo = findExact(segment, this.res.emoticons.keys, 1, this.res.emoticons.count);
    if (emo >= 0) {
      this.type = TYPE_EMOTICON;
      this.emoticon = segment;
      this.emoStrength = this.res.emoticons.vals[emo];
      return -1;
    }
    var len = segment.length;
    var lastType = 0;
    for (var pos = 0; pos < len; pos++) {
      var ch = segment.charAt(pos);
      var wordChar = LETTER_OR_DIGIT.test(ch) ||
        (ch === "'" && pos > 0 && pos < len - 1 && LETTER.test(segment.charAt(pos + 1))) ||
        ch === '$' || ch === '£' || ch === '@' || ch === '_';
      if (wordChar) {
        if (lastType === 2) {
          this.codePunctuation(segment.substring(0, pos));
          return pos;
        }
        lastType = 1;
      } else {
        if (lastType === 1) {
          this.codeWord(segment.substring(0, pos));
          return pos;
        }
        lastType = 2;
      }
    }
    if (lastType === 1) this.codeWord(segment);
    else if (lastType === 2) this.codePunctuation(segment);
    return -1;
  };

  Term.prototype.codePunctuation = function (p) {
    this.type = TYPE_PUNCTUATION;
    if (p.length > 1) {
      this.punct = p.substring(0, 1);
      this.punctEmphasis = p.substring(1);
    } else {
      this.punct = p;
      this.punctEmphasis = '';
    }
  };

  // Collapses repeated letters ("loooove" -> "love"), keeping the extra letters
  // as emphasis, then fixes spelling against the dictionary.
  Term.prototype.codeWord = function (word) {
    var wordNew = '';
    var em = '';
    var sameCount = 0;
    var lastCopiedPos = 0;
    var wordEnd = word.length - 1;
    var pos = 1;
    while (pos <= wordEnd) {
      if (foldChar(word.charAt(pos)) === foldChar(word.charAt(pos - 1))) {
        sameCount++;
      } else {
        if (sameCount > 0 && ILLEGAL_DOUBLE_MIDDLE.indexOf(word.charAt(pos - 1)) >= 0) sameCount++;
        if (sameCount > 1) {
          if (em === '') {
            wordNew = word.substring(0, pos - sameCount + 1);
            em = word.substring(pos - sameCount, pos - 1);
          } else {
            wordNew += word.substring(lastCopiedPos, pos - sameCount + 1);
            em += word.substring(pos - sameCount, pos - 1);
          }
          lastCopiedPos = pos;
        }
        sameCount = 0;
      }
      pos++;
    }
    if (sameCount > 0 && ILLEGAL_DOUBLE_END.indexOf(word.charAt(pos - 1)) >= 0) sameCount++;
    if (sameCount > 1) {
      if (em === '') {
        wordNew = word.substring(0, pos - sameCount + 1);
        em = word.substring(pos - sameCount + 1);
      } else {
        wordNew += word.substring(lastCopiedPos, pos - sameCount + 1);
        em += word.substring(pos - sameCount + 1);
      }
    } else if (em !== '') {
      wordNew += word.substring(lastCopiedPos);
    }
    if (wordNew === '') wordNew = word;

    this.type = TYPE_WORD;
    this.original = word;
    this.emphasis = em;
    this.translated = wordNew;
    if (this.translated.indexOf('@') < 0) this.correctSpelling();
  };

  Term.prototype.correctSpelling = function () {
    var dict = this.res.dictionary;
    var t = this.translated;
    if (dict.has(t.toLowerCase())) return;
    var lastChar = t.length - 1;
    for (var pos = 1; pos <= lastChar; pos++) {
      if (t.charAt(pos) === t.charAt(pos - 1)) {
        var replaced = t.substring(0, pos) + t.substring(pos + 1);
        if (dict.has(replaced.toLowerCase())) {
          this.emphasis += t.charAt(pos);
          this.translated = replaced;
          return;
        }
      }
    }
    if (lastChar > 5) {
      var at = t.indexOf('haha');
      if (at > 0) {
        this.emphasis += t.substring(3, at + 2);
        this.translated = 'haha';
        return;
      }
      at = t.indexOf('hehe');
      if (at > 0) {
        this.emphasis += t.substring(3, at + 2);
        this.translated = 'hehe';
      }
    }
  };

  Term.prototype.isWord = function () { return this.type === TYPE_WORD; };
  Term.prototype.isPunctuation = function () { return this.type === TYPE_PUNCTUATION; };
  Term.prototype.isEmoticon = function () { return this.type === TYPE_EMOTICON; };

  Term.prototype.lcase = function () {
    if (this._lcase === '') this._lcase = this.translated.toLowerCase();
    return this._lcase;
  };

  Term.prototype.originalText = function () {
    if (this.type === TYPE_WORD) return this.original;
    if (this.type === TYPE_PUNCTUATION) return this.punct + this.punctEmphasis;
    if (this.type === TYPE_EMOTICON) return this.emoticon;
    return '';
  };

  // Text the irony check looks at (lowercased word, first punct char, emoticon).
  Term.prototype.text = function () {
    if (this.type === TYPE_WORD) return this.translated.toLowerCase();
    if (this.type === TYPE_PUNCTUATION) return this.punct;
    if (this.type === TYPE_EMOTICON) return this.emoticon;
    return '';
  };

  Term.prototype.punctuationContains = function (s) {
    if (this.type !== TYPE_PUNCTUATION) return false;
    return this.punct.indexOf(s) > -1 || this.punctEmphasis.indexOf(s) > -1;
  };

  Term.prototype.isNegatingWord = function () {
    if (this._negating === null) this._negating = this.res.negating.has(this.lcase());
    return this._negating;
  };

  Term.prototype.boosterScore = function () {
    if (this._booster === null) {
      var b = this.res.booster;
      var id = findExact(this.translated.toLowerCase(), b.keys, 1, b.count);
      this._booster = id >= 0 ? b.vals[id] : 0;
    }
    return this._booster;
  };

  Term.prototype.sentimentValue = function () {
    if (this.override !== null) return this.override;
    if (this._sentiment === null) {
      var s = this.res.sentiment;
      var id = findWithWildcards(this.translated.toLowerCase(), s.keys, 1, s.count);
      this._sentiment = id < 1 ? 0 : s.vals[id];
    }
    return this._sentiment;
  };

  // Capitalised first letter, rest lowercase (e.g. "Obama"), not "I'm".
  Term.prototype.isProperNoun = function () {
    if (this.type !== TYPE_WORD) return false;
    if (this._properNoun === null) {
      this._properNoun = false;
      var w = this.original;
      if (w.length > 1) {
        var first = w.substring(0, 1);
        if (first.toLowerCase() !== first.toUpperCase() && w.substring(0, 2).toUpperCase() !== "I'") {
          var rest = w.substring(1);
          if (first === first.toUpperCase() && rest === rest.toLowerCase()) this._properNoun = true;
        }
      }
    }
    return this._properNoun;
  };

  Term.prototype.matchesStringWithWildcard = function (pattern) {
    var star = pattern.lastIndexOf('*');
    var lc = this.lcase();
    if (star >= 0 && star === pattern.length - 1) {
      var stem = pattern.substring(0, star);
      if (stem === lc) return true;
      if (stem.length >= lc.length) return false;
      return lc.substring(0, stem.length) === stem;
    }
    return pattern.length === this.translated.length && pattern === lc;
  };

  // ---------- Sentence ----------

  function Sentence(text, res) {
    this.res = res;
    this.terms = [null];
    var segments = javaSplit(text, ' ');
    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s];
      var pos = 0;
      while (pos >= 0 && pos < seg.length) {
        var term = new Term(res);
        var offset = term.extract(seg.substring(pos));
        this.terms.push(term);
        pos = offset < 0 ? offset : pos + offset;
      }
    }
    this.termCount = this.terms.length - 1;
  }

  Sentence.prototype.applyIdioms = function () {
    var terms = this.terms;
    var idioms = this.res.idioms;
    for (var t = 1; t <= this.termCount; t++) {
      if (!terms[t].isWord()) continue;
      for (var i = 0; i < idioms.length; i++) {
        var words = idioms[i].words;
        if (t + words.length - 1 > this.termCount) continue;
        var match = true;
        for (var k = 0; k < words.length; k++) {
          if (!terms[t + k].matchesStringWithWildcard(words[k])) { match = false; break; }
        }
        if (match) {
          terms[t].override = idioms[i].strength;
          for (k = 1; k < words.length; k++) terms[t + k].override = 0;
        }
      }
    }
  };

  // Returns { pos, neg } for the sentence.
  Sentence.prototype.score = function () {
    var terms = this.terms;
    var n = this.termCount;
    if (n === 0) return { pos: 1, neg: -1 };

    var sentiment = new Float32Array(n + 2);
    var wordTotal = 0;
    var lastBooster = 0;
    var wordsSinceBooster = 0;
    var wordsSinceNegative = 2; // 0 (max words before sentiment to negate) + 2
    var punctuationBoost = false;

    this.applyIdioms();

    for (var t = 1; t <= n; t++) {
      var term = terms[t];
      var prev = t > 1 ? terms[t - 1] : null;
      if (term.isWord()) {
        wordTotal++;
        if (t === 1 || !term.isProperNoun() || prev.originalText() === ':' ||
            (prev.originalText().length > 3 && prev.originalText().charAt(0) === '@')) {
          sentiment[wordTotal] = term.sentimentValue();
        }

        // repeated letters ("sooooo good") add 0.6, except xx / ww / ha
        if (term.emphasis.length >= MIN_REPEATED_LETTERS_FOR_BOOST &&
            !(t !== 1 && prev.isPunctuation() && prev.originalText() === '@')) {
          var emph = term.emphasis.toLowerCase();
          if (emph.indexOf('xx') < 0 && emph.indexOf('ww') < 0 && emph.indexOf('ha') < 0) {
            // neutral words take the positive branch (igMoodToInterpretNeutralEmphasis = 1)
            sentiment[wordTotal] = sentiment[wordTotal] < 0 ? sentiment[wordTotal] - 0.6 : sentiment[wordTotal] + 0.6;
          }
        }

        // booster words ("very") shift the next word's strength
        if (wordsSinceBooster > 0) lastBooster = 0;
        if (lastBooster !== 0) {
          if (sentiment[wordTotal] > 0) sentiment[wordTotal] += lastBooster;
          else if (sentiment[wordTotal] < 0) sentiment[wordTotal] -= lastBooster;
          if (term.boosterScore() !== 0) {
            lastBooster = term.boosterScore();
            wordsSinceBooster = 0;
          } else {
            wordsSinceBooster++;
          }
        } else {
          lastBooster = term.boosterScore();
          if (lastBooster !== 0) wordsSinceBooster = 0;
        }

        // negation: neutralise negative words, flip and halve positive ones
        if (wordsSinceNegative <= 0) {
          if (sentiment[wordTotal] < 0) sentiment[wordTotal] = 0;
          if (sentiment[wordTotal] > 0) sentiment[wordTotal] = -sentiment[wordTotal] * NEGATED_WORD_MULTIPLIER;
        }
        if (term.isNegatingWord()) wordsSinceNegative = -1;
        if (lastBooster === 0) wordsSinceNegative++;

        // consecutive strong words add 1
        if (sentiment[wordTotal] < -1 && wordTotal > 1 && sentiment[wordTotal - 1] < -1) sentiment[wordTotal] -= 1;
        if (sentiment[wordTotal] > 1 && wordTotal > 1 && sentiment[wordTotal - 1] > 1) sentiment[wordTotal] += 1;
      } else if (term.isEmoticon()) {
        if (term.emoStrength !== 0) {
          if (wordTotal > 0) sentiment[wordTotal] += term.emoStrength;
          else sentiment[++wordTotal] = term.emoStrength;
        }
      } else if (term.isPunctuation()) {
        if (term.punctuationContains('!') && wordTotal > 0) punctuationBoost = true;
      }
    }

    var maxNeg = 0;
    var maxPos = 0;
    for (var w = 1; w <= wordTotal; w++) {
      if (sentiment[w] < maxNeg) maxNeg = sentiment[w];
      if (sentiment[w] > maxPos) maxPos = sentiment[w];
    }
    var pos = Math.round(f32(maxPos + 1));
    var neg = Math.round(f32(maxNeg - 1));

    if (pos === 1) {
      for (t = 1; t <= n; t++) {
        if (terms[t].isWord() && terms[t].translated.toLowerCase() === 'miss') { pos = 2; break; }
      }
    }

    if (punctuationBoost) {
      if (pos < -neg) neg--;
      else pos++; // pos > -neg, or equal (neutral emphasis is read as positive)
    }

    var ironic = this.ironyChange(pos);
    if (ironic) {
      if (neg > -pos) neg = 1 - pos;
      pos = 1;
    }

    if (pos > 5) pos = 5;
    if (neg < -5) neg = -5;
    return { pos: pos, neg: neg };
  };

  // Strong positive plus quotes / "!" / irony terms flips the sentence.
  Sentence.prototype.ironyChange = function (pos) {
    if (pos < MIN_POS_FOR_IRONY) return false;
    var terms = this.terms;
    var t;
    for (t = 1; t <= this.termCount; t++) {
      if (terms[t].isPunctuation() && terms[t].text().indexOf('"') >= 0) return true;
    }
    for (t = 1; t <= this.termCount; t++) {
      if (terms[t].isPunctuation() && terms[t].punctuationContains('!') && terms[t].punctEmphasis.length > 0) return true;
    }
    for (t = 1; t <= this.termCount; t++) {
      if (this.res.irony.has(terms[t].text())) return true;
    }
    return false;
  };

  // ---------- Paragraph ----------

  function isSentenceEnd(c) {
    return c === '.' || c === '!' || c === '?';
  }

  // Letters a-z (case-folded), digits, $, pound sign, apostrophe.
  function isAlphanumeric(c) {
    var f = foldChar(c);
    return (f >= 'a' && f <= 'z') || (c >= '0' && c <= '9') || c === '$' || c === '£' || c === "'";
  }

  function splitSentences(text) {
    text = text.split('"').join("'");
    var sentences = [];
    var lastEnd = -1;
    var punctEnds = false;
    var nextBr = text.indexOf('<br>');
    var next = '';
    for (var pos = 0; pos < text.length; pos++) {
      var c = text.charAt(pos);
      if (pos === text.length - 1) {
        next = text.substring(lastEnd + 1);
      } else if (pos === nextBr) {
        next = text.substring(lastEnd + 1, pos);
        lastEnd = pos + 3;
        nextBr = text.indexOf('<br>', nextBr + 2);
      } else if (isSentenceEnd(c)) {
        punctEnds = true;
      } else if (c === ' ') {
        if (punctEnds) {
          next = text.substring(lastEnd + 1, pos);
          lastEnd = pos;
        }
      } else if (isAlphanumeric(c) && punctEnds) {
        next = text.substring(lastEnd + 1, pos);
        lastEnd = pos - 1;
      }
      if (next !== '') {
        sentences.push(next);
        next = '';
        punctEnds = false;
      }
    }
    return sentences;
  }

  function createScorer(data) {
    var res = buildResources(data);
    return {
      score: function (text) {
        var sentences = splitSentences(text || '');
        var posMax = 0;
        var negMax = 0;
        for (var i = 0; i < sentences.length; i++) {
          var s = new Sentence(sentences[i], res).score();
          if (s.neg < negMax) negMax = s.neg;
          if (s.pos > posMax) posMax = s.pos;
        }
        if (sentences.length === 0) return { positive: 1, negative: -1 };
        return { positive: posMax === 0 ? 1 : posMax, negative: negMax === 0 ? -1 : negMax };
      }
    };
  }

  var api = { createScorer: createScorer };
  var scorer = null;
  api.score = function (text) {
    if (!scorer) scorer = createScorer(root.SENTISTRENGTH_DATA);
    return scorer.score(text);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SentiStrength = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
