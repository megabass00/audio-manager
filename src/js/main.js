const { ipcRenderer, remote } = require('electron');
const fs = require('fs');
const path = require('path');
const BetterQueue = require('better-queue');
// const wsFunctions = require('../js/libs/wavesurfer.functions');


/**
 * Vars
 */
const infoPanel = $('#info');
const infoText = $('#info > .info-text');
const btnSelectFolder = $('#btnSelectFolder');
const btnApplyEffect = $('#btnApplyEffect');
const btnDirectEffect = $('.btnDirect');
const comboEffects = $('#comboEffects');
const waveformProgress = $('#waveformProgress');
const waveformInfo = $('#waveformInfo');
const waveformInfoTime = waveformInfo.find('span:nth-child(1)');
const waveformInfoTitle = waveformInfo.find('span:nth-child(2)');
const waveformEQ = $('#waveformEQ');
const listFiles = $('#listFiles');
const btnSelectOutputFolder = $('#btnSelectOutputFolder');
const btnSelectMicRecordingFolder = $('#btnSelectMicRecordingFolder');
const pannerInput = $('#pannerInput');
const zoomSlider = $('#zoomSlider');

const MAX_CONCURRENT_PROCESS = 5;
const ANIMATION_TIME = 'fast';

let folderSelected;
let outputFolder;
let micRecordingFolder;
let wavesurfer;
let tmrUpdateWaveformInfo;


let applied = 0;
const indexes = [];
let numErrors = 0;
const queue = new BetterQueue((process, done) => {
  if (!typeof process == 'object') return;
  const { link, file, effect, index, total } = process;
  const preloader = link.find('.preload-wrapper');
  const preloaderBar = preloader.find('.determinate');
  const preloaderPercent = link.find('.list-item-preload-percent');
  const doneBadge = link.find('.list-item-done');
  const errorBadge = link.find('.list-item-error');
  preloader.show();
  doneBadge.hide();
  errorBadge.hide();
  indexes.push(index);
  
  // progress function to update UI on custom channel <progress + index>
  const onProgress = (event, arg) => {
    const { percent, data } = arg;
    const roundedPercent = parseInt(percent);
    preloaderBar.css('width', `${roundedPercent}%`);
    preloaderPercent.html(`${roundedPercent}%`);
  }
  ipcRenderer.on('progress' + index, onProgress.bind(this));

  // invoke to the applyEffect function on main process
  ipcRenderer.invoke('applyEffect', { effect, file, index, total })
    .then((data) => {
      const { index, effect, file, error } = data;
      applied++;
      preloader.hide();

      // if there is some error...
      if (error) {
        errorBadge.show();
        numErrors++;
      } else {
        doneBadge.show();
      }

      // update status
      setOptionsStatus(`Operation in progress: ${applied}/${total} processed`);
      
      // when all promises are resolved...
      if (applied == total) { 
        // remove all listeners for progress
        for (let i=0; i<indexes.length; i++) { 
          ipcRenderer.removeAllListeners('progress' + indexes[i]);
        }

        // reset preloads
        $('.list-item-preload .determinate').css('width', 0);
        $('.list-item-preload-percent').text('0%');

        // show info message to user
        setOptionsStatus(`In last operation ${total - numErrors}/${total} audio files was processed and there was ${numErrors} errors`);
        setTimeout(() => {
          if (numErrors == total) {
            ipcRenderer.sendSync('showAlert', {
              type: 'error',
              message: 'Error on all files',
              detail: 'There may be a serious problem because none of the selected files could be processed' 
            });
          } else if (numErrors > 0) {
            ipcRenderer.sendSync('showAlert', {
              type: 'warning',
              message: 'Error on some several files',
              detail: `Some files was processed sucessfully but there was ${numErrors} errors` 
            });
          } else {
            ipcRenderer.sendSync('showAlert', {
              type: 'info',
              message: 'FX was applied !!!',
              detail: `The ${effect.name.toLocaleUpperCase()}${effect.value ? ' whit value ' + effect.value : ''} effect was applied succesfully ;)`
            });
          }
        }, 100);
      }

      // ending task
      done(null, error ? 'An error occurred' : 'File processed OK');
    });
}, { concurrent: MAX_CONCURRENT_PROCESS });


/**
 * Helpers
 */
const resetFileList = placeholder => {
  listFiles.empty();
  if (placeholder) listFiles.append('<li class="collection-header"><strong>Select a music folder please</strong></li>');
}

const getMetadataString = metadata => {
  if (!metadata) return 'No data avaible';
  let metaStr = '';
  metaStr += metadata.size ? `${metadata.size} · ` : ''; 
  metaStr += metadata.numberOfChannels ? `${metadata.numberOfChannels > 1 ? 'Stereo · ' : 'Mono · '}` : ''; 
  metaStr += metadata.sampleRate ? `${metadata.sampleRate} Hz · ` : ''; 
  metaStr += metadata.bitrate ? `${metadata.bitrate / 1000} kbps` : '';
  return metaStr;
}

const resetPlayButtons = sender => {
  $('.play-track').each((i, elem) => {
    const btn = $(elem).find('i');
    if (!sender || !btn.is(sender)) btn.text('play_arrow');
  });
}

const resetBadgesFromList = () => {
  $('.list-item-done').hide();
  $('.list-item-error').hide();
  $('.preload-wrapper').hide();
}

const changeInfoPanelState = isFolderSelected => {
  if (isFolderSelected) {
    infoPanel.removeClass('yellow').addClass('green');
    infoText.html(`You have seleted a music folder:<br />${folderSelected.folder}`);
  } else {
    infoPanel.removeClass('green').addClass('yellow');
    infoText.html('Please, firstly you need to select a music folder...');
  }
}

const getFilesSelectedFromList = () => {
  let selected = [];
  $('.collection-item input:checked').each((i, elem) => selected.push($(elem).parent().parent().parent().parent()));
  return selected;
}

const isPossibleApplyEffect = () => {
  if (!folderSelected || !folderSelected.files || folderSelected.files.length == 0) {
    ipcRenderer.sendSync('showAlert', {
      type: 'warning',
      message: 'There is not a music folder selected',
      detail: 'Please, first off you must select a music folder' 
    });
    return false;
  }

  const files = getFilesSelectedFromList();
  if (files.length == 0) {
    ipcRenderer.sendSync('showAlert', { 
      type: 'warning',
      message: 'Audio files selection',
      detail: 'There is not audio files selected on list. First off, you need to select some file before apply an effect.' 
    });
    return false;
  }
  return true;
}

const confirmOperation = numFiles => {
  const reply = ipcRenderer.sendSync('showAlert', {
    type: 'info',
    message: `Are you sure you want process ${numFiles} files?`,
    detail: 'You must be carefully, this operation is not reversible. If you confim it you can not come back again!',
    buttons: ['Yes', 'Cancel']
  });
  return reply.response == 0 ? true : false;
}

const applyEffect = effect => {
  resetBadgesFromList();
  if (isPossibleApplyEffect()) {
    const links = getFilesSelectedFromList();
    const totalFiles = links.length;
    if (confirmOperation(totalFiles)) {
      wavesurfer.stop();
      setOptionsStatus(`Operation in progress: 0/${totalFiles} processed`);
      for (let i=0; i<totalFiles; i++) {
        const link = links[i];
        const index = link.data('index');
        const file = folderSelected.files[parseInt(index)];
        queue.push({ link, file, effect, index, total: links.length })
        .on('failed', err => console.log('error', err))
        .on('finish', result => console.log(`File ${index} - ${file.name} processed: ${result}`))
      }
    }
    // ipcRenderer.send('applyEffect', { name: effect.name, value: effect.value || null, files }); // asynchronous-message
    // ipcRenderer.on('effectApplied', (event, arg) => { // asynchronous-reply
    //   console.log('effectApplied', arg);
    // });
  }
}

const askForEffectValue = effectType => {
  let options;
  let effect;
  switch (parseInt(effectType)) {
    case 1: // Normalize
      effect = { name: 'normalize' };
      break;
      
    case 2: // Change volume
      effect = { name: 'change-volume' };
      options = { 
        title: 'Select the volume you want',
        label: 'You must select your desired value for apply volume',
        minValue: 1,
        maxValue: 120,
        step: 1,
        defaultValue: 80
      }
      break;
      
    case 3: // Split begin&end
      effect = { name: 'split' };
      break;

    case 4: // Pitch
      effect = { name: 'pitch' };
      options = { 
        title: 'Select the pitch percent amount',
        label: 'You have to select a pitch amount',
        minValue: -120,
        maxValue: 120,
        step: 1,
        defaultValue: 0
      }
      break;

    case 5: // Fade in&out
      effect = { name: 'fade' };
      options = { 
        title: 'Select time to fade in/out',
        label: 'You have to select a time to fade in/out (in milisecons)',
        minValue: 300,
        maxValue: 5000,
        step: 50,
        defaultValue: 1000
      }
      break;

    case 6: // Apply FX reverb
     effect = { name: 'apply-fx' };
     break;

    default:
      throw new Error(`'applyEffect': unknown effectType (${effectType})`);
  }

  if (options) {
    effect['value'] = ipcRenderer.sendSync('prompt', { 
      width: 550, 
      height: 350, 
      title: options.title,
      label: options.label,
      minValue: options.minValue,
      maxValue: options.maxValue,
      step: options.step,
      defaultValue: options.defaultValue
    });
  }

  return effect;
}

const generatePlaylist = () => {
  const paths = folderSelected.files.map(f => f.path);
  const buttons = $('.list-item > div > a');
  let currentTrack = 0;

  const setCurrentSong = index => {
    currentTrack = index;
    const $icon = $(buttons[currentTrack]).find('i');
    const isPaused = $icon.text() == 'play_arrow';
    if (isPaused) {
      resetPlayButtons($icon);
      $icon.html('stop');
      waveformProgress.show();
      wavesurfer.load(paths[currentTrack]);
      waveformInfoTitle.text(folderSelected.files[currentTrack].name);
    } else {
      $icon.html('play_arrow');
      wavesurfer.stop();
    }
  };

  Array.prototype.forEach.call(buttons, (btn, index) => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      setCurrentSong(index);
    });
  });

  wavesurfer.on('ready', () => {
    wavesurfer.play();
    waveformProgress.hide();
  });
  wavesurfer.on('play', e => updateWaveformInfo());
  wavesurfer.on('pause', e => resetWaveformInfo());
  wavesurfer.on('loading', percent => {
    
  });
  wavesurfer.on('error', e => console.warn(e));
  wavesurfer.on('finish', () => resetPlayButtons());
  // wavesurfer.on('finish', () => setCurrentSong((currentTrack + 1) % buttons.length));
  // setCurrentSong(currentTrack);
}

const updateWaveformInfo = () => {
  const current = wavesurfer.getCurrentTime ? wavesurfer.getCurrentTime() : 0;
  const total = wavesurfer.getDuration ? wavesurfer.getDuration() : 0;
  waveformInfoTime.text(`${formattedTime(current)} / ${formattedTime(total)}`);
  tmrUpdateWaveformInfo = setTimeout(() => updateWaveformInfo(), 1000);
}

const resetWaveformInfo = () => {
  clearInterval(tmrUpdateWaveformInfo);
  waveformInfoTime.text('0:00:00 / 0:00:00');
  tmrUpdateWaveformInfo = null;
}

const formattedTime = secs => {
  const secNum = parseInt(secs);
  let hours = Math.floor(secNum / 3600);
  let minutes = Math.floor((secNum - hours * 3600) / 60);
  let seconds = Math.floor(secNum - hours * 3600 - minutes * 60);
  if (hours < 10) {
    hours = '0' + hours;
  }
  if (minutes < 10) {
    minutes = '0' + minutes;
  }
  if (seconds < 10) {
    seconds = '0' + seconds;
  }
  return hours + ':' + minutes + ':' + seconds;
};

const isValidObject = obj => {
  return obj && Object.entries(obj).length > 0 && obj.constructor === Object;
}

const parseFolderName = pathValue => {
  let value = pathValue; 
  if (pathValue.length > 25) {
    const parse = path.parse(pathValue);
    value = `${parse.root}...${path.sep + path.basename(pathValue) + path.sep}`;
  }
  return value;
}

const setOutputFolder = pathValue => {
  outputFolder = pathValue;
  let value = parseFolderName(pathValue);
  $('#side-options .output-folder .value').text(value);
}

const setMicRecordingFolder = pathValue => {
  micRecordingFolder = pathValue;
  let value = parseFolderName(pathValue);
  $('#side-options .record-mic .value').text(value);
}

const setOptionsStatus = statusText => {
  $('#side-options .status > div.value').text(statusText);
} 

const loadAudioFolder = folder => {
  if (!isValidObject(folder)) { 
    console.log('User has cancel selection folder');
    return;
  }

  // if selected folder is the same to last folder it will abort operation
  if (folderSelected && folderSelected.folder == folder.folder) return;

  folderSelected = folder;
  setOutputFolder(folderSelected.folder);
  wavesurfer.empty();

  if (folder && folder.files.length > 0) {
    changeInfoPanelState(true);
    resetFileList(false);
    const filesOrdered = folder.files.sort((a,b) => (a.name > b.name) ? 1 : ((b.name > a.name) ? -1 : 0));  
    const length = filesOrdered.length;
    const headerInfo = `
      <li class="collection-header">
        <div class="collection-header-info">
          <h5>${length} files in '${folder.name}'</h5>
          <a id="btnUnselectAll" class="waves-effect waves-light btn"><i class="material-icons left">tab_unselected</i>Unselect All</a>
        </div>
      </li>
    `;
    listFiles.append(headerInfo);

    for (let i=0; i<length; i++) {
      const file = filesOrdered[i];
      listFiles.append(`
        <li class="collection-item valign-wrapper list-item" data-index="${i}">
          <span class="list-item-info">
            <span class="title">${file.name}</span>
            <br />
            <small>${getMetadataString(file.metadata)}</small>
          </span>
          <div class="list-actions">
            <div class="list-item-done" style="display: none;">
              <i class="material-icons">done</i>
            </div>
            <div class="list-item-error" style="display: none">
              <i class="material-icons">error</i>
              <span>Error</span>
            </div>
            <div class="preload-wrapper" style="display: none">
              <div class="list-item-preload-percent">1%</div>
              <div class="progress list-item-preload">
                <div class="determinate" style="width: 1%"></div>
              </div>
            </div>
            <a class="corporative play-track" data-state="paused">
              <i class="material-icons">play_arrow</i>
            </a>
            <div class="switch">
              <label>
                <input class="select-track" type="checkbox" checked >
                <span class="lever"></span>
              </label>
            </div>
          </div>
        </li>
      `);
    }
    generatePlaylist();
  } else {
    changeInfoPanelState(false);
    resetFileList(true);
    console.warn('There are no audio files in folder selected');
  }
}



/**
 * Listeners
 */
btnSelectOutputFolder.click(e => {
  const folder = ipcRenderer.sendSync('btnSelectOutputFolder', '');
  if (!folder) { 
    console.log('User has cancel selection folder');
    return;
  }
  setOutputFolder(folder);
});

btnSelectMicRecordingFolder.click(e => {
  const folder = ipcRenderer.sendSync('btnSelectMicRecordingFolder', '');
  if (!folder) { 
    console.log('User has cancel selection folder');
    return;
  }
  setMicRecordingFolder(folder);
});

btnSelectFolder.click(e => {
  const folder = ipcRenderer.sendSync('btnSelectFolderClick', '');
  loadAudioFolder(folder);
});

$('#listFiles').on('change', '.select-track', e => {
  const isChecked = $(e.target).is(':checked');
});

$('#listFiles').on('click', '#btnUnselectAll', e => {
  const iconName = $(e.target).find('i').text();
  let selectAll;
  if (iconName == 'select_all') {
    selectAll = true;
    $(e.target).html(`<i class="material-icons left">tab_unselected</i>Unselect All`);
  } else {
    selectAll = false;
    $(e.target).html(`<i class="material-icons left">select_all</i>Select All`);
  }
  $('.select-track').prop('checked', selectAll);
});

$('#dropdown-fx li').click(e => {
  const $this = $(e.target);
  const type = $this.data('type');
  const fxName = $this.data('value');
  const effect = { name: 'apply-fx', value: fxName.toLocaleUpperCase() };
  applyEffect(effect);

  const effectName = $this.text();
  $('#dropdown-btn').html(`<i class="material-icons left">palette</i>${effectName}`);
});

btnApplyEffect.click(e => {
  const effectSelected = comboEffects.val();
  if (!effectSelected) {
    const reply = ipcRenderer.sendSync('showAlert', {
      type: 'warning',
      message: 'Effect selection',
      detail: 'Please, first off you must select a effect to apply' 
    });
    return false;
  }

  const effect = askForEffectValue(effectSelected);
  applyEffect(effect);
});

btnDirectEffect.click(e => {
  const type = $(e.target).data('type');
  const effect = askForEffectValue(type);
  applyEffect(effect);
});

pannerInput.change(e => {
  const value = e.target.value;
  $('#pannerValue').text(value != 0 ? `${value}%` : 'center');
  wavesurfer.panner.pan.value = Number(value);
});

pannerInput.dblclick(() => {
  pannerInput.val(0);
  wavesurfer.panner.pan.value = 0;
  $('#pannerValue').text('center');
});

zoomSlider.change(e => {
  wavesurfer.zoom(Number(e.target.value));
});

zoomSlider.dblclick(() => {
  wavesurfer.zoom(0);
  zoomSlider.val(0);
});

$('.btnZoom').click(e => {
  const action = $(e.target).data('action') || $(e.target).parent().data('action');
  let currentZoom = parseInt(zoomSlider.val());
  if (action == 'zoomOut') currentZoom -= 10;
  if (action == 'zoomIn') currentZoom += 10;
  if (currentZoom < 0) currentZoom = 0;
  if (currentZoom > 200) currentZoom = 200;
  zoomSlider.val(currentZoom);
  wavesurfer.zoom(currentZoom);
});

$('#player-option-eq').click(() => {
  const eq = $('#waveformEQ');
  const isChecked = $('#player-option-eq').prop('checked');
  isChecked ? eq.show(ANIMATION_TIME) : eq.hide(ANIMATION_TIME);
});

$('#player-option-timeline').click(() => {
  const timeline = $('#waveformTimeline');
  const isChecked = $('#player-option-timeline').prop('checked');
  isChecked ? timeline.show(ANIMATION_TIME) : timeline.hide(ANIMATION_TIME);
});

$('#player-option-zoom').click(() => {
  const zoom = $('#waveformZoom');
  const isChecked = $('#player-option-zoom').prop('checked');
  isChecked ? zoom.show(ANIMATION_TIME) : zoom.hide(ANIMATION_TIME);
});



/**
 * Events
 */
ipcRenderer.on('folderSelected', (event, folder) => {
  console.log('folderSelected', folder);
  loadAudioFolder(folder);
});

ipcRenderer.on('showOptions', (event, arg) => {
  const settingsPanel = M.Sidenav.getInstance(document.getElementById('side-options'));
  settingsPanel.isOpen ? settingsPanel.close() : settingsPanel.open();
});


/**
 * DOM Events
 */
document.addEventListener('DOMContentLoaded', function() {
  $('.sidenav').sidenav();
  $('select').formSelect();
  $('.tooltipped').tooltip();
  $('.dropdown-trigger').dropdown();

  const wavesurferOptions = {
    container: '#waveform',
    // backend: 'MediaElement',
    waveColor: '#428bca',
    progressColor: '#31708f',
    loaderColor: '#0000ff',
    cursorColor: 'navy',
    selectionColor: '#d0e9c6',
    height: 60,
    splitChannels: true,
    // barWidth: 3,
    // barRadius: 3,
    // barGap: 3,
    plugins: [
      WaveSurfer.cursor.create({
        showTime: true,
        opacity: 1,
        customShowTimeStyle: {
          'background-color': '#000',
          color: '#fff',
          padding: '2px',
          'font-size': '10px'
        }
      }),
      WaveSurfer.timeline.create({
        container: '#waveformTimeline',
        primaryColor: '#c3c3c3',
        secondaryColor: '#dcdcdc',
        primaryFontColor: '#a9a9a9',
        secondaryFontColor: '#a9a9a9',
      }) 
    ]
  };

  wavesurfer = WaveSurfer.create(wavesurferOptions);
  wavesurfer.panner = wavesurfer.backend.ac.createStereoPanner();
  wavesurfer.backend.setFilter(wavesurfer.panner);

  // init eq controls
  const { EQ } = require('../utils/constants');
  const eqFilters = EQ.map(band => {
    const filter = wavesurfer.backend.ac.createBiquadFilter();
    filter.type = band.type;
    filter.gain.value = 0;
    filter.Q.value = 1;
    filter.frequency.value = band.f;
    
    const control = $(`
      <div class="eqControlWrapper">
        <span>${band.f}Hz</span>
        <input class="eqControl" type="range" min="-50" max="50" title="${band.f}" orient="vertical" >
        <span>0%</span>
      </div>
    `);

    control.change(e => {
      filter.gain.value = ~~e.target.value;
      const value = e.target.value;
      const valueContainer = $(e.target).parent().find('span:nth-child(3)');
      const color = value > 0 ? 'green' : value == 0 ? 'darkgray' : 'red'; 
      valueContainer.css('color', color);
      valueContainer.text(`${value}%`);
    });
    control.dblclick(e => {
      const valueContainer = $(e.target).parent().find('span:nth-child(3)');
      valueContainer.css('color', 'darkgray');
      valueContainer.text('0%');
      $(e.target).val(0);
    });

    waveformEQ.append(control);
    return filter;
  });

  wavesurfer.backend.setFilters(eqFilters);
});