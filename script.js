import { GoogleGenerativeAI } from "@google/generative-ai";
import { prompts, safetySettings } from "./prompts.js";

const responseElement = document.getElementById("response");
const cameraSelect = document.getElementById("cameraSelect");
const promptSelect = document.getElementById("promptSelect");
const speakBtn = document.getElementById("speak");
const promptInput = document.getElementById("prompt");
const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");

let active = false;
let output = "";
let speaking = false;
let model;

promptInput.value = `What do you see in this picture? Describe in detail, along with reasoning.`;

const show = (text) => (responseElement.innerText = text);

// YOLO Model Setup
const loadModel = async () => {
  model = await cocoSsd.load();
  console.log("YOLO model loaded successfully.");
};

const detectObjects = async () => {
  if (!model) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const predictions = await model.detect(video);
  predictions.forEach(prediction => {
    const [x, y, width, height] = prediction.bbox;
    context.beginPath();
    context.rect(x, y, width, height);
    context.lineWidth = 2;
    context.strokeStyle = "red";
    context.fillStyle = "red";
    context.stroke();
    context.fillText(
      `${prediction.class} (${(prediction.score * 100).toFixed(1)}%)`,
      x,
      y > 10 ? y - 5 : 10
    );
  });
  requestAnimationFrame(detectObjects);
};

// Speech Recognition Setup
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.interimResults = true;
recognition.continuous = true;

recognition.onstart = () => {
  speakBtn.innerText = "Stop Speaking";
  speaking = true;
};

recognition.onresult = (event) => {
  const transcript = Array.from(event.results)
    .map(result => result[0].transcript)
    .join('');
  promptInput.value = transcript;
};

recognition.onend = () => {
  if (speaking) recognition.start();
  else speakBtn.innerText = "Speak";
};

speakBtn.addEventListener("click", () => {
  if (speaking) {
    recognition.stop();
    speaking = false;
  } else {
    recognition.start();
    speaking = true;
  }
});

// Camera and AI Setup
document.querySelector("#click").addEventListener("click", captureImage);
prompts.forEach((prompt) => {
  const option = document.createElement("option");
  option.text = prompt.description;
  option.value = prompt["prompt"];
  promptSelect.add(option);
});

document.querySelector("#hide").addEventListener("click", () => {
  document.querySelector("#settings").style.display = 
    document.querySelector("#hide").checked ? "none" : "";
});

async function captureImage() {
  if (active) return;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageDataURL = canvas.toDataURL("image/jpeg");
  const imageFile = new File([dataURItoBlob(imageDataURL)], "image.jpg", {
    type: "image/jpeg",
  });
  const image = await fileToGenerativePart(imageFile);
  const API_KEY = document.querySelector("#api").value;
  if (!API_KEY.trim()) return show("Please provide an API_KEY.");

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-8b",
    safetySettings,
  });

  show("Loading...");
  active = true;
  try {
    const start = Date.now();
    const res = await model.generateContentStream([promptInput.value, image]);
    let text = "";
    for await (const chunk of res.stream) {
      text += chunk.text();
      show(text);
    }
    output = text;
    show(`${output} [${((Date.now() - start) / 1000).toFixed(1)}s]`);
  } catch (e) {
    show(`Error: ${e.toString()}`);
  }
  active = false;
}

// Utility Functions
function dataURItoBlob(dataURI) {
  const byteString = atob(dataURI.split(",")[1]);
  const mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return new Blob([arrayBuffer], { type: mimeString });
}

async function fileToGenerativePart(file) {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
}

// Initialize
loadModel().then(() => {
  video.addEventListener("loadeddata", detectObjects);
});

navigator.mediaDevices.enumerateDevices()
  .then(devices => {
    devices.filter(d => d.kind === "videoinput")
      .forEach(device => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Camera ${cameraSelect.options.length + 1}`;
        cameraSelect.add(option);
      });
    setCamera(cameraSelect.value);
  });

cameraSelect.addEventListener("change", setCamera);

function setCamera(selectedCameraId) {
  if (video.srcObject) video.srcObject.getTracks().forEach(track => track.stop());
  navigator.mediaDevices.getUserMedia({ video: { deviceId: selectedCameraId } })
    .then(stream => {
      video.srcObject = stream;
      video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      });
    });
}