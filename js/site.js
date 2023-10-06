// Please see documentation at https://docs.microsoft.com/aspnet/core/client-side/bundling-and-minification
// for details on configuring this project to bundle and minify static web assets.

// Write your JavaScript code.

// https://lancaster-university.github.io/microbit-docs/resources/bluetooth/bluetooth_profile.html
// An implementation of Nordic Semicondutor's UART/Serial Port Emulation over Bluetooth low energy
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";

// Allows the micro:bit to transmit a byte array
const UART_RX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

// Allows a connected client to send a byte array
const UART_TX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

let device;
let rxCharacteristic;
var activeAudioContext;
var effectInterval;

async function serialButtonPressed() {
    if ("serial" in navigator) {
        console.log("Serial");
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 /* pick your baud rate */ });
        while (port.readable) {
            const reader = port.readable.getReader();

            try {
                let currentLine = '';
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        // Allow the serial port to be closed later.
                        reader.releaseLock();
                        break;
                    }
                    if (value) {
                        const receivedString = String.fromCharCode.apply(null, value);
                        currentLine = currentLine + receivedString;
                        while (currentLine.indexOf('\r\n') > -1) {
                            let lineToPrint = currentLine.slice(0, currentLine.indexOf('\r\n'));
                            currentLine = currentLine.slice(currentLine.indexOf('\r\n' + 2));
                            if (isJSON(lineToPrint)) {
                                let jsonObj = JSON.parse(lineToPrint);
                                if (jsonObj.canvasData) {
                                    window.canvasData = jsonObj.canvasData;
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                // TODO: Handle non-fatal read error.
            }
        }
    }
}

async function onButtonClick() {
    if (window.device) {
        const server = await window.device.gatt.connect();
        await setUpUart(server, window.device);
    } else {
        let options = {};
        options.filters = [{ name: 'mpy-uart' }];
        options.optionalServices = [UART_SERVICE_UUID];

        console.log('Requesting Bluetooth Device...');
        console.log('with ' + JSON.stringify(options));
        let device = await navigator.bluetooth.requestDevice(options);
        window.device = device;

        console.log('> Name:             ' + device.name);
        console.log('> Id:               ' + device.id);
        console.log('> Connected:        ' + device.gatt.connected);

        const server = await device.gatt.connect();
        await setUpUart(server, device);
    }
}

async function onDisconnectClick() {
    await window.device.gatt.disconnect();
}

var $canvas = $('canvas');
var ctx = $canvas[0].getContext('2d', { willReadFrequently: true });
window.ctx = ctx;

setInterval(() => {
    if (window.canvasData) {
        paintCanvas(window.canvasData);
    }
},1000/60)

async function setUpUart(server, device) {
    window.device = device;
    const service = await server.getPrimaryService(UART_SERVICE_UUID);

    const txCharacteristic = await service.getCharacteristic(
        UART_TX_CHARACTERISTIC_UUID
    );

    txCharacteristic.startNotifications();
    txCharacteristic.addEventListener(
        "characteristicvaluechanged",
        (event) => {
            let receivedData = [];
            for (var i = 0; i < event.target.value.byteLength; i++) {
                receivedData[i] = event.target.value.getUint8(i);
            }

            const receivedString = String.fromCharCode.apply(null, receivedData);

            console.log(receivedString);

            if (receivedString === "S") {
                console.log("Shaken!");
            } else if (isJSON(receivedString)) {

                let jsonObj = JSON.parse(receivedString);
                if (jsonObj.canvasData) {
                    window.canvasData = jsonObj.canvasData;
                }
            }
        }
    );
    rxCharacteristic = await service.getCharacteristic(
        UART_RX_CHARACTERISTIC_UUID
    );
}

async function paintCanvas(canvasData) {
    ctx = window.ctx;
    var canvasWidth = canvasData.length;
    var canvasHeight = canvasData[0].length;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    var id = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    var pixels = id.data;

    canvasData.forEach((col, x) => {
        col.forEach((row, y) => {
            var r = row[0];
            var g = row[1]
            var b = row[2]
            var off = (y * id.width + x) * 4;
            pixels[off] = r;
            pixels[off + 1] = g;
            pixels[off + 2] = b;
            pixels[off + 3] = 255;
        })
    })

    ctx.putImageData(id, 0, 0);
}

function isJSON(str) {
    try {
        return JSON.parse(str) && !!str;
    } catch (e) {
        return false;
    }
}

async function stopAudio() {
    if (activeAudioContext) {
        activeAudioContext.close();
        activeAudioContext = undefined;
    }
}

function disconnectButtonPressed() {
    if (!device) {
        return;
    }

    if (device.gatt.connected) {
        device.gatt.disconnect();
        console.log("Disconnected");
    }
}

async function pingButtonPressed() {
    //beep();

    if (!rxCharacteristic) {
        return;
    }

    try {
        let encoder = new TextEncoder();
        await rxCharacteristic.writeValue(encoder.encode("toggle\r\n"));
    } catch (error) {
        console.log(error);
    }
}

async function fireCommand() {
    let $text = $('#command_entry');
    localStorage["lastCommand"] = $text.val();
    await sendCommand($text.val());
}

async function sendCommand(command) {
    console.log("Sent: "+command)
    if (!rxCharacteristic) {
        return;
    }

    try {
        let encoder = new TextEncoder();
        await rxCharacteristic.writeValue(encoder.encode(command));
    } catch (error) {
        console.log(error);
    }
}

function onTxCharacteristicValueChanged(event) {
    
}

function cacheFile(file) {
    var promise = new Promise((resolve, reject) => {
        var reader = new FileReader();
        reader.onload = (event) => {
            localStorage["file"] = event.target.result;
            resolve(file);
        }
        reader.readAsDataURL(file);
    });
    return promise;
}

function loadCachedFile(base64) {
    var base64Parts = base64.split(",");
    //var fileFormat = base64Parts[0].split(";")[1];
    var fileFormat = 'application/x-zip-compressed';
    var fileContent = base64Parts[1];
    //var file = new File([fileContent], "cache.zip", { type: fileFormat });
    return fileContent;
}

function beep() {
    var snd = new Audio("data:audio/wav;base64,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qJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU=");
    snd.play();
}

async function processZipFile(zip) {
    var fileKeys = Object.keys(zip.files);
    var songDirs = fileKeys.map(key => zip.files[key].dir ? zip.files[key] : null).filter(f => f != null);
    var songInfos = await Promise.all(songDirs.map(async dir => {
        var dirFiles = fileKeys.filter(key => key.startsWith(dir.name) && key != dir.name).map(key => zip.files[key]);
        var songFile = dirFiles.find(f => f.name.endsWith('mp3'));
        var timingsFile = dirFiles.find(f => f.name.endsWith('csv'));
        var timingsContent = await timingsFile.async("string");
        var timings = d3.csvParse(timingsContent);

        //var mp3Content = new Blob(await songFile.async("uint8array"), { type: "audio/mp3" });
        //var fileReader = new FileReader;
        //fileReader.onload = function () {
        //    var arrayBuffer = this.result;
        //    console.log(arrayBuffer);
        //    console.log(arrayBuffer.byteLength);
        //}
        //fileReader.readAsArrayBuffer(mp3Content);


        return {
            dir,
            songFile,
            timingsFile,
            timingsContent,
            timings,
            //mp3Content,
            //mp3Url: URL.createObjectURL(mp3Content)
        }
    }));
    console.log(songInfos);
    $songInfos = $('#song_infos');
    $songInfos.empty();

    songInfos.forEach(si => {
        $button = $("<button>");
        $button.text(si.dir.name);
        $button.on('click', async () => {
            var mp3Buffer = await si.songFile.async("arraybuffer");
            await stopAudio();
            activeAudioContext = new AudioContext();
            var audioSource = activeAudioContext.createBufferSource();
            audioSource.connect(activeAudioContext.destination);

            activeAudioContext.decodeAudioData(mp3Buffer, function (res) {
                audioSource.buffer = res;
                /*
                  Do something with the sound, for instance, play it.
                  Watch out: all the sounds will sound at the same time!
                */
                //audioSource.noteOn(0);
                let offset = window.audioOffsetTime || 0;
                audioSource.start(0, offset);
                var previousTime = offset;
                var currentTime = 0;
                if (effectInterval) {
                    clearInterval(effectInterval);
                }
                effectInterval = setInterval(() => {
                    currentTime = audioSource.context.currentTime + offset - (300/1000);
                    var newEvents = si.timings.filter(t => t["Start"] > previousTime && t["Start"] < currentTime);
                    newEvents.map(evt => evt["Command"]).filter(cmd => (cmd || '').trim() !== '').forEach(cmd => sendCommand(cmd));
                    previousTime = currentTime;
                }, 1000 / 60);
            });
        });
        $button.appendTo($songInfos);
    })
}

$('input[type=file]').on('change', async function (event) {
    var file = event.target.files[0];
    await cacheFile(file);
    var zip = await JSZip.loadAsync(file);
    processZipFile(zip);
});

// Reconnecting to already paired devices should be supported in Chrome when using 
// chrome://flags/#enable-web-bluetooth-new­-permissions-backend 
// and 
// chrome://flags/#enable-experimental-web-­platform-features 
// and this code:

async function getPermittedBluetoothDevices() {
    let devices = await navigator.bluetooth.getDevices();
    for (let device of devices) {
        // Start a scan for each device before connecting to check that they're in
        // range.
        let abortController = new AbortController();
        await device.watchAdvertisements({ signal: abortController.signal });
        device.addEventListener('advertisementreceived', async (evt) => {
            // Stop the scan to conserve power on mobile devices.
            abortController.abort();

            // At this point, we know that the device is in range, and we can attempt
            // to connect to it.
            const server = await evt.device.gatt.connect();
            await setUpUart(server, evt.device);
        });
    }
}

getPermittedBluetoothDevices();

async function loadCachedZip() {
    var fileContent = loadCachedFile(localStorage["file"]);
    var zip = await JSZip.loadAsync(fileContent, { base64: true });
    processZipFile(zip);
}

if (localStorage["file"]) {
    loadCachedZip();
}

if (localStorage["lastCommand"]) {
    $("#command_entry").val(localStorage["lastCommand"]);
}

$(document).ready(function () {
    $offsetTime = $("#offset_time");
    if (localStorage["offsetTime"]) {
        $offsetTime.val(parseFloat(localStorage["offsetTime"]));
        setTimeout(() => {
            $offsetTime.change();
        }, 0)
    }
    $offsetTime.change(() => {
        window.audioOffsetTime = parseFloat($offsetTime.val());
        localStorage["offsetTime"] = parseFloat($offsetTime.val());
    });
});
