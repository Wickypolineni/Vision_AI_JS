import { GoogleGenerativeAI } from "@google/generative-ai";
import { prompts, safetySettings } from "./prompts.js";

/* ======================================================================================== */
// DOM and state management setup
/* ======================================================================================== */

const responseElement = document.getElementById("response");
const cameraSelect = document.getElementById("cameraSelect");
const promptSelect = document.getElementById("promptSelect");
const speakBtn = document.getElementById("speak");
const stopSpeakingBtn = document.getElementById("stopSpeaking"); // New button reference
const promptInput = document.getElementById("prompt");
const video = document.getElementById("webcam");
const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");

const gearIcon = document.getElementById("gear-icon");
const apiKeyModal = document.getElementById("api-key-modal");
const apiKeyInput = document.getElementById("api-key-input");
const saveApiKeyButton = document.getElementById("save-api-key");

let active = false; // is the model currently generating a response
let output = ""; // last output
let speaking = false; // is the speech synthesis currently speaking

speakBtn.style.display = ""; // Ensure the Speak button is visible
promptInput.value = `What do you see in this picture? Describe in detail, along with reasoning.`;

// Retrieve API key from localStorage
let API_KEY = localStorage.getItem("apiKey") || "";

// Function to validate the API key
function validateApiKey() {
  if (!API_KEY) {
    alert("Please set your API key using the gear icon.");
    return false;
  }
  return true;
}

// Show/hide API key modal
gearIcon.addEventListener("click", () => {
  apiKeyModal.classList.toggle("hidden");
});

// Save API key to localStorage
saveApiKeyButton.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  if (apiKey) {
    API_KEY = apiKey;
    localStorage.setItem("apiKey", apiKey); // Save the API key in localStorage
    alert("API key saved successfully!");
    apiKeyModal.classList.add("hidden");
  } else {
    alert("Please enter a valid API key.");
  }
});

// Use the API key in your application logic only when required
if (!API_KEY) {
  console.log("API key is not set. Please set it using the gear icon.");
}

const show = (text) => (responseElement.innerText = text);
promptSelect.addEventListener("change", (e) => {
  document.querySelector("#prompt").value = promptSelect.value;
});

document.querySelector("#click").addEventListener("click", captureImage);
prompts.forEach((prompt) => {
  const option = document.createElement("option");
  option.text = prompt.description;
  option.value = prompt["prompt"];
  promptSelect.add(option);
});

document.querySelector("#hide").checked = false;
document.querySelector("#hide").addEventListener("click", () => {
  const state = document.querySelector("#hide").checked;
  if (state) {
    document.querySelector("#settings").style.display = "none";
  } else {
    document.querySelector("#settings").style.display = "";
  }
});

speakBtn.addEventListener("click", () => {
  if (speaking) {
    speechSynthesis.cancel(); // Stop speaking
    speaking = false;
    speakBtn.innerText = "Speak";
  } else {
    // Request microphone permissions and start recognition
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        recognition.start();
        speaking = true;
        speakBtn.innerText = "Stop Speaking";
      })
      .catch((error) => {
        alert("Microphone access is required to use speech recognition.");
        console.error("Microphone access denied:", error);
      });
  }
});

/* ======================================================================================== */
// Speech Recognition Setup
/* ======================================================================================== */

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
  promptInput.value = transcript; // Display the transcribed speech in the prompt field
};

recognition.onend = () => {
  if (speaking) recognition.start();
  else speakBtn.innerText = "Speak";
};

/* ======================================================================================== */
// Generative AI invocation and response handling
/* ======================================================================================== */

async function captureImage() {
  if (active) return;

  // Validate API key before making the API call
  if (!validateApiKey()) return;

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageDataURL = canvas.toDataURL("image/jpeg");
  const imageFile = new File([dataURItoBlob(imageDataURL)], "image.jpg", {
    type: "image/jpeg",
  });
  const image = await fileToGenerativePart(imageFile);

  let genAI;
  try {
    genAI = new GoogleGenerativeAI(API_KEY);
  } catch (e) {
    show(`Oops something went wrong.\nError: ${e}`);
    return;
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    safetySettings,
  });
  show("Loading... ");
  let res;
  active = true;
  try {
    let start = Date.now();
    res = await model.generateContentStream([promptInput.value, image]);
    let text = "";
    for await (const chunk of res.stream) {
      text += chunk.text();
      show(text);
    }
    output = text;
    show(`${output} [${((Date.now() - start) / 1000).toFixed(1)}s]`);
    speak(output); // Read out the generated response
  } catch (e) {
    console.error(e);
    show(`Oops something went wrong.\nError: ${e.toString()}`);
    active = false;
    return;
  }

  active = false;
}

// Live mode setup
function initializeLiveMode() {
  // Validate API key only when live mode is used
  if (!validateApiKey()) return;

  // Add logic for live mode here (if applicable)
  console.log("Live mode initialized.");
}

// Call initializeLiveMode if live mode is active
if (window.location.pathname.includes("live")) {
  initializeLiveMode();
}

/* ======================================================================================== */
// Text-to-Speech Functionality
/* ======================================================================================== */

// Update the speak function to show the "Stop Speaking" button
function speak(txt) {
  speechSynthesis.cancel(); // Stop any ongoing speech
  speaking = true;
  const utterance = new SpeechSynthesisUtterance(txt);
  stopSpeakingBtn.style.display = "inline"; // Show the "Stop Speaking" button
  utterance.onend = () => {
    speaking = false;
    speakBtn.innerText = "Speak"; // Reset button text after speaking
    stopSpeakingBtn.style.display = "none"; // Hide the "Stop Speaking" button
  };
  speechSynthesis.speak(utterance);
}

// Add functionality to the "Stop Speaking" button
stopSpeakingBtn.addEventListener("click", () => {
  speechSynthesis.cancel(); // Stop any ongoing speech
  speaking = false;
  stopSpeakingBtn.style.display = "none"; // Hide the "Stop Speaking" button
  speakBtn.innerText = "Speak"; // Reset the "Speak" button text
});

/* ======================================================================================== */
// Setup camera
/* ======================================================================================== */

navigator.mediaDevices
  .enumerateDevices()
  .then((devices) => {
    devices.forEach((device) => {
      if (device.kind === "videoinput") {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text =
          device.label || `Camera ${cameraSelect.options.length + 1}`;
        cameraSelect.add(option);
      }
    });
  })
  .catch((error) => {
    show(`Error enumerating devices: ${error}`);
    console.error(`Error enumerating devices: ${error}`);
  });

cameraSelect.addEventListener("change", setCamera);

function setCamera() {
  const selectedCameraId = cameraSelect.value;
  // disable all other media streams
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
  }
  navigator.mediaDevices
    .getUserMedia({
      video: { deviceId: selectedCameraId },
    })
    .then((stream) => {
      video.srcObject = stream;
    })
    .catch((error) => {
      console.error(`Error accessing webcam: ${error}`);
      show(`Error accessing webcam: ${error}`);
    });
}

setCamera();

/* ======================================================================================== */
// Utility Functions
/* ======================================================================================== */

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

