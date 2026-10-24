/**
 * Express 4 tidak menangkap error dari fungsi async secara otomatis.
 * Bungkus handler dengan wrap() supaya error (mis. database/Storage gagal)
 * diteruskan ke error handler di server.js, bukan membuat request menggantung.
 */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { wrap };
