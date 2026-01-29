import { GoogleGenAI, Type } from "@google/genai";

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_FLASH = 'gemini-3-flash-preview';

/**
 * Transcribes audio using Gemini Flash.
 */
export const transcribeAudio = async (audioBase64: string, mimeType: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_FLASH,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64
            }
          },
          {
            text: "Transcribe the following medical clinical audio session verbatim. Return only the transcript text, no markdown formatting or intro/outro text."
          }
        ]
      }
    });
    return response.text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
};

/**
 * Generates a structured clinical document.
 */
export const generateDocument = async (
  transcript: string,
  context: string,
  promptInstruction: string,
  patientInfo: string,
  practiceInfo: string = ""
): Promise<string> => {
  try {
    const prompt = `
      You are an expert medical scribe.
      
      Practice/Provider Information:
      ${practiceInfo}

      Patient Information: ${patientInfo}
      (If gender is 'Unknown', infer it from the transcript if possible, otherwise use gender-neutral terms).
      
      Additional Context Provided: ${context}
      
      Transcript:
      ${transcript}
      
      Instructions:
      ${promptInstruction}
      
      Format the document professionally using Markdown. Include the practice information in the header if relevant to the document type (e.g. Referral).
    `;

    const response = await ai.models.generateContent({
      model: MODEL_FLASH,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 } 
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Document generation error:", error);
    throw error;
  }
};

/**
 * Generates a concise title for the session based on the transcript.
 */
export const generateSessionTitle = async (transcript: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_FLASH,
      contents: `Generate a very short, concise title (max 5 words) for this medical session based on the transcript. It should reflect the main reason for visit or diagnosis (e.g., "Acute Bronchitis Follow-up", "Hypertension Consult"). Do not include words like "Session" or "Visit" unless necessary. Transcript: ${transcript}`,
    });
    return response.text?.replace(/['"]+/g, '').trim() || "New Session";
  } catch (error) {
    return "New Session";
  }
};

/**
 * Opal Chat Assistant
 */
export const chatWithOpal = async (
  history: { role: 'user' | 'model'; content: string }[],
  currentNote: string,
  currentTranscript: string
): Promise<string> => {
  try {
    const systemInstruction = `
      You are Opal, a smart AI medical assistant embedded in OneChart.
      Your goal is to help the clinician with the current session.
      You have access to the current note and transcript.
      
      CRITICAL INSTRUCTION:
      If the user asks to create a new document, note, or specific text format (e.g. "Create a referral letter"), 
      output ONLY the content of that document. 
      DO NOT include any conversational preamble like "Here is the referral letter:" or "Sure, I can help with that.".
      Just output the document content directly.

      Current Note Content:
      ${currentNote}
      
      Current Transcript:
      ${currentTranscript}
    `;

    const chat = ai.chats.create({
      model: MODEL_FLASH,
      config: {
        systemInstruction,
      },
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.content }]
      }))
    });

    const lastMessage = history[history.length - 1];
    
    const response = await chat.sendMessage({
      message: lastMessage.content
    });

    return response.text || "I apologize, I couldn't process that request.";
  } catch (error) {
    console.error("Opal chat error:", error);
    return "Opal is temporarily unavailable.";
  }
};

/**
 * Extracts tasks/reminders from the note
 */
export const extractTasks = async (note: string): Promise<{content: string, tag: string}[]> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_FLASH,
      contents: `Extract a JSON list of actionable tasks specifically for the PHYSICIAN to complete after the session.
      Focus on orders, referrals, prescriptions, billing queries, or administrative follow-ups.
      Do NOT include instructions for the patient (like "Rest and drink fluids").
      
      Keep the task content VERY succinct, direct, and imperative (e.g. "Order chest X-ray", "Refer to Cardiology", "Prescribe Amoxicillin").
      
      For each task, provide 'content' and a 'tag'.
      Tags must be one of: 'Prescription', 'Referral', 'Lab/Imaging', 'Admin', 'Follow-up'.
      
      Return strictly a JSON array of objects.
      Note: ${note}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              content: { type: Type.STRING },
              tag: { type: Type.STRING }
            }
          }
        }
      }
    });
    
    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    return [];
  }
};
