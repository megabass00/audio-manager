const electron = require('electron');
const { app, BrowserWindow, Menu, ipcMain } = electron;
const path = require('path');
const url = require('url');
const { openFolder, showInfoDialog } = require('./utils/menuFunctions');

const APP_WIDTH = 500;
const APP_HEIGHT = 1000;

const isDev = !app.isPackaged;
let mainWindow;
let modalWindow;
let modalOptions
let modalAnswer;
let folderSelected;

const createMainWindow = () => {
  console.clear();
  console.log(`Executing in ${isDev ? 'DEV' : 'PROD'} mode`);
  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu(mainMenu);

  mainWindow = new BrowserWindow({
    show: false,
    width: APP_WIDTH,
    height: APP_HEIGHT,
    // minWidth: 500,
    // minHeight: 600,
    fullscreenWindowTitle: true,
    fullscreenable: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'views/index.html'),
    protocol: 'file',
    slashes: true
  }));
  mainWindow.maximize();
  isDev && mainWindow.webContents.openDevTools();

  // on close
  mainWindow.on('close', async e => {
    e.preventDefault();
    const result = await showInfoDialog(mainWindow, { 
      type: 'question',
      buttons: ['&Yes','&No'],
      defaultId: 2,
      title: 'Multiple buttons on a message box',
      message: 'Do you really want to quit?',
      detail: 'Press Yes button to quit',
      checkboxLabel: 'Checkbox only works with callback',
      checkboxChecked: true,
      cancelId: 2,
      noLink: true,
      normalizeAccessKeys: true
    });
    if (result.response == 0) {
      mainWindow.destroy();
    }
  });
  
  // on closed
  mainWindow.on('closed', () => {
    console.log('Closing app...');
    mainWindow = null
  });
}

const createModalWindow = (parent, callback, options) => {
  modalOptions = options;
  const { width, height, title, minValue, maxValue } = options;
  modalWindow = new BrowserWindow({
    title,
    width, 
    height, 
    parent,
    show: false,
    modal: true,
    alwaysOnTop : true, 
    autoHideMenuBar: true,
    resizable: false,
    webPreferences: { 
      nodeIntegration:true,
      sandbox : false 
    }   
  });

  modalWindow.on('closed', () => { 
    modalWindow = null 
    callback(modalAnswer);
  })

  modalWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'views/modal.html'),
    protocol: 'file',
    slashes: true
  }));
  modalWindow.once('ready-to-show', () => modalWindow.show());
  // isDev && modalWindow.webContents.openDevTools();

  modalWindow.on('closed', () => {
    console.log('Closing modal window...');
    modalWindow = null
  });
}

const mainMenuTemplate = [
  {
    label: 'Archivo',
    submenu: [
      {
        label: 'Open folder',
        accelerator: process.platform === 'darwin' ? 'command+O' : 'Ctrl+O',
        click: (e, focusedWindow) => selectFolder()
      },
      {
        label: 'Exit',
        accelerator: process.platform === 'darwin' ? 'command+Q' : 'Ctrl+Q',
        click: () => app.quit()
      }
    ],
  },
  {
    label: 'Edit',
    submenu: [
      {
        label: 'Show Dev Tools',
        accelerator: process.platform === 'darwin' ? 'command+D' : 'Ctrl+D',
        click: (e, focusedWindow) => focusedWindow.toggleDevTools()
      },
      {
        label: 'Apply selected FX',
        accelerator: process.platform === 'darwin' ? 'command+F' : 'Ctrl+F',
        click: () => {
          // TODO
        }
      },
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'Created by megabass00',
        click: () => require('electron').shell.openExternal('https://github.com/megabass00/audio-manager')
      },
    ]
  }
];

app.on('ready', createMainWindow);
 

app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
      createMainWindow()
  }
})


if (process.platform === 'darwin') {
  mainMenuTemplate.unshift({
    label: app.getName()
  })
}


/**
 * Functions
 */
async function selectFolder(event) {
  const result = await openFolder(app);
  if (result && result.files.length > 0) {
    folderSelected = result;
  }
  if (event) {
    event.returnValue = result;
  }else{
    mainWindow.webContents.send('folderSelected', result);
  }
}


/**
 * Events
 */
ipcMain.on('btnSelectFolderClick', (event, arg) => {
  selectFolder(event);
})

ipcMain.on('showAlert', async (event, arg) => {
  const result = await showInfoDialog(mainWindow, {
    type: arg.type || 'error',
    message: arg.message,
    detail: arg.detail
  });
  event.returnValue = result || 'dialogShowed';
})

// async
ipcMain.handle('applyEffect', async (event, data) => {
  const { effect, path } = data;
  // {
  //   effect: { name: 'normalize' },
  //   file: {
  //     metadata: {
  //       common: [Object],
  //       format: [Object],
  //       native: {},
  //       quality: [Object]
  //     },
  //     name: 'prueba3.mp3',
  //     path: 'C:\\Users\\usuario\\Desktop\\TEST FILES bola\\prueba3.mp3'
  //   }
  // }
  const randomTime = Math.floor(Math.random() * (8000 - 4000 + 1) + 3000);
  await new Promise(resolve => setTimeout(resolve, randomTime));
  return data;
})
// ipcMain.on('applyEffect', async (event, effect) => { // asynchronous-message
//   console.log('effect', effect);
//   // show confirmation
//   await showInfoDialog(mainWindow, {
//     type: 'info',
//     message: 'FX was applied !!!',
//     detail: `The ${effect.name.toLocaleUpperCase()}${effect.value ? ' whit value ' + effect.value : ''} effect was applied succesfully ;)`
//   });
//   event.reply('effectApplied', effect) // asynchronous-reply
// })

// modal events
// called by the dialog box to get its parameters
ipcMain.on('openDialog', (event, data) => {
  event.returnValue = JSON.stringify(modalOptions, null, '')
})

// called by the dialog box when closed
ipcMain.on('closeDialog', (event, data) => {
  modalAnswer = data;
})

// called by the application to open the modal dialog
ipcMain.on('prompt', (event, options) => {
  createModalWindow(mainWindow, data => event.returnValue = data, options);        
});
