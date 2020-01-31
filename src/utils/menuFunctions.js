const electron = require('electron');
const fs = require('fs');
const AudioFileModifier = require('audio-file-modifier');
const afmOptions = {
  overwrite: true,
  volume: 1.0,
  sampleRate: 44100,
  channels: 2,
  pitch: 120,
  fade: 2000,
  verbose: true
};

const openFolder = async app => {
  // open dialog
  const result = await electron.dialog.showOpenDialog({
    title: "Choose a folder with mp3 audio files",
    buttonLabel: "Choose Folder",
    defaultPath: app.getPath("desktop"),
    properties: ["openDirectory"],
  });
  if (!result || result.canceled) return null;

  // find audio files on selected folder
  const folderPath = result.filePaths[0];
  const fileNames = fs.readdirSync(folderPath).filter(file => file.includes(".mp3"));
  let audioFiles = [];
  for (let i=0; i<fileNames.length; i++) {
    const name = fileNames[i];
    const path = `${folderPath}\\${name}`;
    const metadata = await (new AudioFileModifier({ verbose: false })).getMetadata(path);
    audioFiles.push({ name, path, metadata: metadata || {} });
  }
  
  return {
    name: folderPath.split("\\")[folderPath.split("\\").length - 1],
    folder: folderPath,
    files: audioFiles
  }
}

const showInfoDialog = async (win, { type = 'info', title = 'Audio Manager · Info', message = '', detail = '', buttons = [] }) => {
  // types: none/info/error/question/warning
  const options = { type, buttons, title, message, detail };
  return await electron.dialog.showMessageBox(win, options);
}

const applyEffect = data => {
  // {
  //   effect: { name: 'normalize', value?: 0.8 },
  //   file: {
  //     metadata: {
  //       bitrate: 262995,
  //       duration: 371.304,
  //       numberOfChannels: 2,
  //       sampleRate: 48000
  //     },
  //     name: 'prueba3.mp3',
  //     path: 'C:\\Users\\usuario\\Desktop\\TEST FILES bola\\prueba3.mp3'
  //   },
  //   index: 1 <index-of-file>,
  //   total: 4 <total-files-to-process>,
  //   onProgress: <progress-function>
  // }
  const { effect, file, index, total, onProgress } = data;
  const afm = new AudioFileModifier({ ...afmOptions, onProgress });
  // if (onProgress) afm.config.onProgress = onProgress;
  switch(effect.name) {
    case 'normalize':
      return afm.normalizeFile(file.path);
      
    case 'change-volume':
      return afm.changeFileVolume(file.path, effect.value);
      
    case 'split':
      return afm.splitSilences(file.path);

    case 'pitch':
      return afm.changePitch(file.path, effect.value);

    case 'fade':
      return afm.createFade(file.path, effect.value);

    case 'apply-fx':
      return afm.applyEffect(file.path, effect.value);

    default:
      throw new Error(`applyEffect: 'effect.name' unknown (${effect.name})`);
  }
}


module.exports = {
  openFolder,
  showInfoDialog,
  applyEffect
}