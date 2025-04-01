"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readStringContents = readStringContents;
exports.readInt = readInt;
exports.readCodePoint = readCodePoint;
// We inline this package
// eslint-disable-next-line import/no-extraneous-dependencies
var charCodes = require("charcodes");
// The following character codes are forbidden from being
// an immediate sibling of NumericLiteralSeparator _
var forbiddenNumericSeparatorSiblings = {
    decBinOct: new Set([
        charCodes.dot,
        charCodes.uppercaseB,
        charCodes.uppercaseE,
        charCodes.uppercaseO,
        charCodes.underscore, // multiple separators are not allowed
        charCodes.lowercaseB,
        charCodes.lowercaseE,
        charCodes.lowercaseO,
    ]),
    hex: new Set([
        charCodes.dot,
        charCodes.uppercaseX,
        charCodes.underscore, // multiple separators are not allowed
        charCodes.lowercaseX,
    ]),
};
var isAllowedNumericSeparatorSibling = {
    // 0 - 1
    bin: function (ch) { return ch === charCodes.digit0 || ch === charCodes.digit1; },
    // 0 - 7
    oct: function (ch) { return ch >= charCodes.digit0 && ch <= charCodes.digit7; },
    // 0 - 9
    dec: function (ch) { return ch >= charCodes.digit0 && ch <= charCodes.digit9; },
    // 0 - 9, A - F, a - f,
    hex: function (ch) {
        return (ch >= charCodes.digit0 && ch <= charCodes.digit9) ||
            (ch >= charCodes.uppercaseA && ch <= charCodes.uppercaseF) ||
            (ch >= charCodes.lowercaseA && ch <= charCodes.lowercaseF);
    },
};
function readStringContents(type, input, pos, lineStart, curLine, errors) {
    var initialPos = pos;
    var initialLineStart = lineStart;
    var initialCurLine = curLine;
    var out = "";
    var firstInvalidLoc = null;
    var chunkStart = pos;
    var length = input.length;
    for (;;) {
        if (pos >= length) {
            errors.unterminated(initialPos, initialLineStart, initialCurLine);
            out += input.slice(chunkStart, pos);
            break;
        }
        var ch = input.charCodeAt(pos);
        if (isStringEnd(type, ch, input, pos)) {
            out += input.slice(chunkStart, pos);
            break;
        }
        if (ch === charCodes.backslash) {
            out += input.slice(chunkStart, pos);
            var res = readEscapedChar(input, pos, lineStart, curLine, type === "template", errors);
            if (res.ch === null && !firstInvalidLoc) {
                firstInvalidLoc = { pos: pos, lineStart: lineStart, curLine: curLine };
            }
            else {
                out += res.ch;
            }
            (pos = res.pos, lineStart = res.lineStart, curLine = res.curLine);
            chunkStart = pos;
        }
        else if (ch === charCodes.lineSeparator ||
            ch === charCodes.paragraphSeparator) {
            ++pos;
            ++curLine;
            lineStart = pos;
        }
        else if (ch === charCodes.lineFeed || ch === charCodes.carriageReturn) {
            if (type === "template") {
                out += input.slice(chunkStart, pos) + "\n";
                ++pos;
                if (ch === charCodes.carriageReturn &&
                    input.charCodeAt(pos) === charCodes.lineFeed) {
                    ++pos;
                }
                ++curLine;
                chunkStart = lineStart = pos;
            }
            else {
                errors.unterminated(initialPos, initialLineStart, initialCurLine);
            }
        }
        else {
            ++pos;
        }
    }
    return process.env.BABEL_8_BREAKING
        ? { pos: pos, str: out, firstInvalidLoc: firstInvalidLoc, lineStart: lineStart, curLine: curLine }
        : {
            pos: pos,
            str: out,
            firstInvalidLoc: firstInvalidLoc,
            lineStart: lineStart,
            curLine: curLine,
            containsInvalid: !!firstInvalidLoc,
        };
}
function isStringEnd(type, ch, input, pos) {
    if (type === "template") {
        return (ch === charCodes.graveAccent ||
            (ch === charCodes.dollarSign &&
                input.charCodeAt(pos + 1) === charCodes.leftCurlyBrace));
    }
    return (ch === (type === "double" ? charCodes.quotationMark : charCodes.apostrophe));
}
function readEscapedChar(input, pos, lineStart, curLine, inTemplate, errors) {
    var _a, _b;
    var throwOnInvalid = !inTemplate;
    pos++; // skip '\'
    var res = function (ch) { return ({ pos: pos, ch: ch, lineStart: lineStart, curLine: curLine }); };
    var ch = input.charCodeAt(pos++);
    switch (ch) {
        case charCodes.lowercaseN:
            return res("\n");
        case charCodes.lowercaseR:
            return res("\r");
        case charCodes.lowercaseX: {
            var code = void 0;
            (_a = readHexChar(input, pos, lineStart, curLine, 2, false, throwOnInvalid, errors), code = _a.code, pos = _a.pos);
            return res(code === null ? null : String.fromCharCode(code));
        }
        case charCodes.lowercaseU: {
            var code = void 0;
            (_b = readCodePoint(input, pos, lineStart, curLine, throwOnInvalid, errors), code = _b.code, pos = _b.pos);
            return res(code === null ? null : String.fromCodePoint(code));
        }
        case charCodes.lowercaseT:
            return res("\t");
        case charCodes.lowercaseB:
            return res("\b");
        case charCodes.lowercaseV:
            return res("\u000b");
        case charCodes.lowercaseF:
            return res("\f");
        case charCodes.carriageReturn:
            if (input.charCodeAt(pos) === charCodes.lineFeed) {
                ++pos;
            }
        // fall through
        case charCodes.lineFeed:
            lineStart = pos;
            ++curLine;
        // fall through
        case charCodes.lineSeparator:
        case charCodes.paragraphSeparator:
            return res("");
        case charCodes.digit8:
        case charCodes.digit9:
            if (inTemplate) {
                return res(null);
            }
            else {
                errors.strictNumericEscape(pos - 1, lineStart, curLine);
            }
        // fall through
        default:
            if (ch >= charCodes.digit0 && ch <= charCodes.digit7) {
                var startPos = pos - 1;
                var match = /^[0-7]+/.exec(input.slice(startPos, pos + 2));
                var octalStr = match[0];
                var octal = parseInt(octalStr, 8);
                if (octal > 255) {
                    octalStr = octalStr.slice(0, -1);
                    octal = parseInt(octalStr, 8);
                }
                pos += octalStr.length - 1;
                var next = input.charCodeAt(pos);
                if (octalStr !== "0" ||
                    next === charCodes.digit8 ||
                    next === charCodes.digit9) {
                    if (inTemplate) {
                        return res(null);
                    }
                    else {
                        errors.strictNumericEscape(startPos, lineStart, curLine);
                    }
                }
                return res(String.fromCharCode(octal));
            }
            return res(String.fromCharCode(ch));
    }
}
// Used to read character escape sequences ('\x', '\u').
function readHexChar(input, pos, lineStart, curLine, len, forceLen, throwOnInvalid, errors) {
    var _a;
    var initialPos = pos;
    var n;
    (_a = readInt(input, pos, lineStart, curLine, 16, len, forceLen, false, errors, 
    /* bailOnError */ !throwOnInvalid), n = _a.n, pos = _a.pos);
    if (n === null) {
        if (throwOnInvalid) {
            errors.invalidEscapeSequence(initialPos, lineStart, curLine);
        }
        else {
            pos = initialPos - 1;
        }
    }
    return { code: n, pos: pos };
}
function readInt(input, pos, lineStart, curLine, radix, len, forceLen, allowNumSeparator, errors, bailOnError) {
    var start = pos;
    var forbiddenSiblings = radix === 16
        ? forbiddenNumericSeparatorSiblings.hex
        : forbiddenNumericSeparatorSiblings.decBinOct;
    var isAllowedSibling = radix === 16
        ? isAllowedNumericSeparatorSibling.hex
        : radix === 10
            ? isAllowedNumericSeparatorSibling.dec
            : radix === 8
                ? isAllowedNumericSeparatorSibling.oct
                : isAllowedNumericSeparatorSibling.bin;
    var invalid = false;
    var total = 0;
    for (var i = 0, e = len == null ? Infinity : len; i < e; ++i) {
        var code = input.charCodeAt(pos);
        var val = void 0;
        if (code === charCodes.underscore && allowNumSeparator !== "bail") {
            var prev = input.charCodeAt(pos - 1);
            var next = input.charCodeAt(pos + 1);
            if (!allowNumSeparator) {
                if (bailOnError)
                    return { n: null, pos: pos };
                errors.numericSeparatorInEscapeSequence(pos, lineStart, curLine);
            }
            else if (Number.isNaN(next) ||
                !isAllowedSibling(next) ||
                forbiddenSiblings.has(prev) ||
                forbiddenSiblings.has(next)) {
                if (bailOnError)
                    return { n: null, pos: pos };
                errors.unexpectedNumericSeparator(pos, lineStart, curLine);
            }
            // Ignore this _ character
            ++pos;
            continue;
        }
        if (code >= charCodes.lowercaseA) {
            val = code - charCodes.lowercaseA + charCodes.lineFeed;
        }
        else if (code >= charCodes.uppercaseA) {
            val = code - charCodes.uppercaseA + charCodes.lineFeed;
        }
        else if (charCodes.isDigit(code)) {
            val = code - charCodes.digit0; // 0-9
        }
        else {
            val = Infinity;
        }
        if (val >= radix) {
            // If we found a digit which is too big, errors.invalidDigit can return true to avoid
            // breaking the loop (this is used for error recovery).
            if (val <= 9 && bailOnError) {
                return { n: null, pos: pos };
            }
            else if (val <= 9 &&
                errors.invalidDigit(pos, lineStart, curLine, radix)) {
                val = 0;
            }
            else if (forceLen) {
                val = 0;
                invalid = true;
            }
            else {
                break;
            }
        }
        ++pos;
        total = total * radix + val;
    }
    if (pos === start || (len != null && pos - start !== len) || invalid) {
        return { n: null, pos: pos };
    }
    return { n: total, pos: pos };
}
function readCodePoint(input, pos, lineStart, curLine, throwOnInvalid, errors) {
    var _a, _b;
    var ch = input.charCodeAt(pos);
    var code;
    if (ch === charCodes.leftCurlyBrace) {
        ++pos;
        (_a = readHexChar(input, pos, lineStart, curLine, input.indexOf("}", pos) - pos, true, throwOnInvalid, errors), code = _a.code, pos = _a.pos);
        ++pos;
        if (code !== null && code > 0x10ffff) {
            if (throwOnInvalid) {
                errors.invalidCodePoint(pos, lineStart, curLine);
            }
            else {
                return { code: null, pos: pos };
            }
        }
    }
    else {
        (_b = readHexChar(input, pos, lineStart, curLine, 4, false, throwOnInvalid, errors), code = _b.code, pos = _b.pos);
    }
    return { code: code, pos: pos };
}
