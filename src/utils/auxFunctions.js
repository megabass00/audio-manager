const mm = require('music-metadata');
const util = require('util');


/**
 * Aux functions
 */
const getMetadata = pathToFile => {
  return {
    format: {
      tagTypes: [],
      lossless: false,
      container: 'MPEG',
      codec: 'MPEG 1 Layer 3',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitrate: 128000,
      codecProfile: 'CBR',
      numberOfSamples: 164736,
      duration: 3.7355102040816326
    },
    native: {},
    quality: { warnings: [] },
    common: { track: { no: null, of: null }, disk: { no: null, of: null } }
  };
  // const metadata = afm.getMetadata(pathToFile);
  const metadata = mm.parseFile(pathToFile)
    .then(metadata => {
      let tmp = util.inspect(metadata, { showHidden: false, depth: null });
      tmp = tmp
            .replace(/'/g, '"')
            .replace(/undefined/g, '"undefined"')
            .replace(/Object/g, '"Object"')
            .replace(/([{,])(\s*)([A-Za-z0-9_\-]+?)\s*:/g, '$1"$3":');

      return JSON.parse(tmp); 
    })
    .catch(err => false);

  return metadata;
}


module.exports = {
  getMetadata,
  // generateWaveform,
}