// ajv-cli custom-keyword module (used via `-c`): registers the "x-editor"
// presentation hints so strict mode accepts them. Keep in sync with edit-server.mjs.
module.exports = (ajv) => {
  ajv.addKeyword('x-editor');
  return ajv;
};
