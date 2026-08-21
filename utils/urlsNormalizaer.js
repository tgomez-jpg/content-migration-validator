function normalizarUrl(url) {
    const urlObj = new URL(url);

    // Eliminar fragmento (#...)
    urlObj.hash = '';

    // Eliminar parámetros de consulta (?COT=CA, ?PM=CA, etc.)
    //urlObj.search=''; 
    urlObj.searchParams.delete('COT');
    urlObj.searchParams.delete('PM');

    // Normalizar trailing slash
    if (urlObj.pathname !== '/') {
        urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
    }

    return urlObj.href;
}

module.exports = { normalizarUrl };