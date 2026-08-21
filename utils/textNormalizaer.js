function normalizeText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

module.exports = { normalizeText };