const electron = require('electron');
const fs = require('fs');
const { getMetadata } = require('./auxFunctions');
// const AudioFileModifier = require('audio-file-modifier');
// const afm = new AudioFileModifier({
//   overwrite: true,
//   volume: 1.0,
//   sampleRate: 44100,
//   channels: 2,
//   pitch: 120,
//   fade: 2000,
//   verbose: false
// });

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
  // console.log('Result', result.filePaths);
  const folderPath = result.filePaths[0];
  const fileNames = fs.readdirSync(folderPath).filter(file => file.includes(".mp3"));
  let audioFiles = [];
  for (let i=0; i<fileNames.length; i++) {
    const name = fileNames[i];
    const path = `${folderPath}\\${name}`;
    const metadata = await getMetadata(path);
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


module.exports = {
  openFolder,
  showInfoDialog
}