import { GoogleGenerativeAI } from "@google/generative-ai";

const getGenAI = () => {
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (!API_KEY) return null;
  return new GoogleGenerativeAI(API_KEY);
};

export async function generateBiasReport(metrics: any, fairnessStats: any) {
  try {
    const genAI = getGenAI();
    if (!genAI) {
      return "Configuration Error: VITE_GEMINI_API_KEY is missing. Please check your .env file and ensure Vite has picked it up.";
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      You are an Ethical AI Auditor. Analyze the following model results and fairness metrics:
      
      MODEL PERFORMANCE:
      - Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%
      - Precision: ${(metrics.precision * 100).toFixed(2)}%
      - F1 Score: ${(metrics.f1 * 100).toFixed(2)}%
      
      FAIRNESS METRICS:
      - Statistical Parity Difference (SPD): ${fairnessStats?.debiased?.spd?.toFixed(4) || "N/A"}
      - Disparate Impact (DI): ${fairnessStats?.debiased?.di?.toFixed(4) || "N/A"}
      - Wasserstein Distance: ${fairnessStats?.debiased?.wasserstein?.toFixed(4) || "N/A"}
      
      TASK:
      Provide a professional, concise "Bias Mitigation Report" (max 200 words). 
      Include:
      1. A "Verdict" on compliance (e.g., compliant with 80% rule).
      2. One specific technical observation about the accuracy-fairness trade-off.
      3. A recommendation for further optimization.
      
      Format with professional, technical language suitable for a high-stakes AI hackathon. Use markdown.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error: any) {
    console.error("Gemini Error:", error);
    return `Error generating AI report: ${error.message || error.toString()}\nPlease verify your API key and network connection.`;
  }
}

export async function getPipelineInsights(datasetDescription: string | null, stage: string, contextData: any) {
  if (!datasetDescription) return null;

  try {
    const genAI = getGenAI();
    if (!genAI) return null;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      You are an AI Data Scientist assisting with an automated machine learning pipeline.
      
      DATASET CONTEXT provided by the user:
      "${datasetDescription}"
      
      CURRENT PIPELINE STAGE: ${stage}
      
      STAGE CONTEXT DATA:
      ${JSON.stringify(contextData, null, 2)}
      
      TASK:
      Provide a brief (max 2-3 sentences), highly specific insight or recommendation for this stage, keeping the dataset context in mind.
      For example, if this is Feature Selection and certain variables are dropped, explain if it makes sense given the dataset's domain.
      If this is Fairness analysis, suggest which attributes are most likely to carry bias based on the context.
      Do not hallucinate data. Be concise, professional, and actionable.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini Error:", error);
    return null;
  }
}
