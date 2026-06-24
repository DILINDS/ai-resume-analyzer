import { useState } from "react";
import { supabase } from "./services/supabase";

import { extractTextFromPDF } from "./services/pdfExtractor";
import { analyzeResume } from "./services/analyzeResume";

function ResumeUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState("");
  const [analysis, setAnalysis] = useState("");

  const uploadResume = async () => {
    try {
      if (!file) {
        alert("Please select a PDF first");
        return;
      }
    
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;

      console.log("Uploading:", fileName);
      

      const { data, error } = await supabase.storage
        .from("resumes")
        .upload(fileName, file);

      console.log("Upload Data:", data);
      console.log("Upload Error:", error);

      if (error) {
      console.log("FULL ERROR:", JSON.stringify(error, null, 2));
      alert(error.message);
      }

      const { error: dbError } = await supabase
        .from("resumes")
        .insert([
          {
            filename: fileName,
          },
        ]);

      if (dbError) {
        alert("Database Error: " + dbError.message);
        return;
      }

      alert("Resume uploaded successfully!");
    } catch (err) {
      console.error(err);
      alert("Unexpected error occurred");
    }
  };

const analyzePDF = async () => {
  try {
    alert("Analyze button clicked");

    if (!file) {
      alert("Select a PDF first");
      return;
    }

    const extractedText = await extractTextFromPDF(file);

    alert("PDF extracted successfully");

    console.log(extractedText);

    const aiResult = await analyzeResume(extractedText);

    setAnalysis(aiResult);



  } catch (error) {
    console.error(error);
    alert("ERROR: " + String(error));
  }
};

  // 👇 OUTSIDE uploadResume
  const loadResumes = async () => {
    const { data, error } = await supabase
      .from("resumes")
      .select("*");

    if (error) {
      setResult(error.message);
      return;
    }

    setResult(JSON.stringify(data, null, 2));
  };
  return (
    <div style={{ padding: "20px" }}>
      <h1>AI Resume Analyzer</h1>

      <h2>Upload Resume</h2>

      <input
        type="file"
        accept=".pdf"
        onChange={(e) => {
          const selectedFile = e.target.files?.[0];

          if (selectedFile) {
            setFile(selectedFile);
            alert("Selected: " + selectedFile.name);
          }
        }}
      />

      <br />
      <br />

      <p>
        {file
          ? `Selected File: ${file.name}`
          : "No file selected"}
      </p>

      <br />

      <button onClick={uploadResume}>
        Upload Resume
      </button>

      <br />
      <br />
       
      <button onClick={analyzePDF}>
        Analyze Resume
      </button>

      <br />
      <br />

      <h3>Result</h3>

      <pre>{result}</pre>

      <h3>Extracted Resume Text</h3>

      <pre>{analysis}</pre>
    </div>
  );
}

export default ResumeUpload;