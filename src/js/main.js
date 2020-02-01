const { ipcRenderer, remote } = require('electron');
const fs = require('fs');


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
const listFiles = $('#listFiles');

let folderSelected;
let wavesurfer;
let tmrUpdateWaveformInfo;



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
    const reply = ipcRenderer.sendSync('showAlert', {
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

const applyEffect = effect => {
  if (isPossibleApplyEffect()) {
    wavesurfer.stop();
    let applied = 0;
    const links = getFilesSelectedFromList();
    const indexes = [];
    for (let i=0; i<links.length; i++) {
      let numErrors = 0;
      const link = links[i];
      const preloader = link.find('.preload-wrapper');
      const preloaderBar = preloader.find('.determinate');
      const preloaderPercent = link.find('.list-item-preload-percent');
      const errorBadge = link.find('.list-item-error');
      preloader.show();
      errorBadge.hide();
      const index = link.data('index');
      indexes.push(index);
      const file = folderSelected.files[parseInt(index)];

      // progress function to update UI on custom channel <progress + index>
      const onProgress = (event, arg) => {
        const { percent, data } = arg;
        const roundedPercent = parseInt(percent);
        preloaderBar.css('width', `${roundedPercent}%`);
        preloaderPercent.html(`${roundedPercent}%`);
      }
      ipcRenderer.on('progress' + index, onProgress.bind(this));

      // invoke to the applyEffect function on main process
      ipcRenderer.invoke('applyEffect', { effect, file, index, total: links.length })
        .then(({ index, effect, file, error }) => {
          applied++;
          preloader.hide();

          // if there is some error...
          if (error) {
            preloader.hide();
            errorBadge.show();
            numErrors++;
          }
          
          // when all promises are resolved...
          if (applied == links.length) { 
            // remove all listeners for progress
            for (let i=0; i<indexes.length; i++) { 
              console.log('Removing listener', indexes[i]);
              ipcRenderer.removeAllListeners('progress' + indexes[i]);
            }
            // show info message to user
            setTimeout(() => {
              if (numErrors == links.length) {
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
        });
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
        defaultValue: 1000
      }
      break;

    case 6: // Apply FX reverb
     effect = { name: 'apply-fx' };
     break;

    default:
      throw new Error(`applyEffect: 'effectType' unknown (${effectType})`);
  }

  if (options) {
    effect['value'] = ipcRenderer.sendSync('prompt', { 
      width: 550, 
      height: 350, 
      title: options.title,
      label: options.label,
      minValue: options.minValue,
      maxValue: options.maxValue,
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
      waveformProgress.css('opacity', 1);
      wavesurfer.load(paths[currentTrack]);
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
    waveformProgress.css('opacity', 0);
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
  waveformInfo.text(`${formattedTime(current)} / ${formattedTime(total)}`);
  tmrUpdateWaveformInfo = setTimeout(() => updateWaveformInfo(), 1000);
}

const resetWaveformInfo = () => {
  clearInterval(tmrUpdateWaveformInfo);
  waveformInfo.text('0:00:00 / 0:00:00');
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


/**
 * Listeners
 */
btnSelectFolder.click(e => {
  const folder = ipcRenderer.sendSync('btnSelectFolderClick', '');
  if (!folder) { 
    console.log('User has cancel selection folder');
    return;
  }

  // if selected folder is the same to last folder it will abort operation
  if (folderSelected && folderSelected.folder == folder.folder) return;

  folderSelected = folder;
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
});

// $('#listFiles').on('click', '.play-track', e => {
//   $this = $(e.target);
//   const isPaused = $this.text() == 'play_circle_filled';
//   if (isPaused) resetPlayButtons($this);
//   $this.html(isPaused ? 'play_circle_outline' : 'play_circle_filled');
//   // TODO: if is paused play this track
// });

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



/**
 * Events
 */
ipcRenderer.on('folderSelected', (event, folder) => {
  console.log('Reveived folder', folder);
});


/**
 * DOM Events
 */
document.addEventListener('DOMContentLoaded', function() {
  $('select').formSelect();
  $('.dropdown-trigger').dropdown();

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#428bca',
    progressColor: '#31708f',
    loaderColor: '#0000ff',
    cursorColor: 'navy',
    selectionColor: '#d0e9c6',
    height: 100,
    // barWidth: 3,
  });
});