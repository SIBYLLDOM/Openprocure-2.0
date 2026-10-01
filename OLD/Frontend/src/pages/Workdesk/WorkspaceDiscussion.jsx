import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Paperclip,
  Mic,
  Image as ImageIcon,
  FileText,
  Users,
  Circle,
  X,
  StopCircle,
} from "lucide-react";

const WorkspaceDiscussion = () => {
  // -------------------- MEMBERS ------------------------
  const members = [
    { id: 1, name: "Sandeep", online: true },
    { id: 2, name: "Steve Jerald", online: true },
    { id: 3, name: "Paramesh", online: false },
    { id: 4, name: "Dominic", online: true },
    { id: 5, name: "Sujith", online: true },
  ];

  const [showMembers, setShowMembers] = useState(false);

  // -------------------- CHAT MESSAGES ------------------------
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "Sandeep",
      content: "Good morning team!",
      type: "text",
      time: "10:03 AM",
      mine: false,
    },
    {
      id: 2,
      sender: "You",
      content: "Morning bro!",
      type: "text",
      time: "10:04 AM",
      mine: true,
    },
  ]);

  const chatRef = useRef(null);

  // -------------------- INPUT STATES ------------------------
  const [message, setMessage] = useState("");
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Preview states for file sending
  const [imagePreview, setImagePreview] = useState(null);
  const [documentPreview, setDocumentPreview] = useState(null);
  const [audioPreviewURL, setAudioPreviewURL] = useState(null);

  // -------------------- RECORDING ------------------------
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  // Auto scroll
  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  // -------------------- SEND MESSAGE ------------------------
  const sendMessage = () => {
    // --- SEND AUDIO ---
    if (audioPreviewURL) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: "You",
          type: "audio",
          fileURL: audioPreviewURL,
          mine: true,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setAudioPreviewURL(null);
      return;
    }

    // --- SEND IMAGE ---
    if (imagePreview) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: "You",
          type: "image",
          fileURL: imagePreview.url,
          content: imagePreview.name,
          mine: true,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setImagePreview(null);
      return;
    }

    // --- SEND DOCUMENT ---
    if (documentPreview) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: "You",
          type: "document",
          fileURL: documentPreview.url,
          content: documentPreview.name,
          mine: true,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setDocumentPreview(null);
      return;
    }

    // --- SEND TEXT ---
    if (!message.trim()) return;

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        sender: "You",
        type: "text",
        content: message,
        mine: true,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);

    setMessage("");
  };

  // -------------------- FILE PREVIEW HANDLER ------------------------
  const handleFileUpload = (event, fileType) => {
    const file = event.target.files[0];
    if (!file) return;

    if (fileType === "image") {
      setImagePreview({
        name: file.name,
        url: URL.createObjectURL(file),
      });
    }

    if (fileType === "document") {
      setDocumentPreview({
        name: file.name,
        url: URL.createObjectURL(file),
      });
    }

    setShowAttachMenu(false);
  };

  // -------------------- VOICE RECORDING ------------------------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data);

      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: "audio/webm" });
        const url = URL.createObjectURL(audioBlob);
        setAudioPreviewURL(url);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone permission denied.");
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
    setShowAttachMenu(false);
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f3f6fb" }}>
      

      {/* ---------------- MEMBERS PANEL (TOGGLE) ---------------- */}
      {showMembers && (
        <div
          style={{
            width: "20rem",
            position: "absolute",
            background: "white",
            height: "100%",
            borderRight: "1px solid #e5e7eb",
            zIndex: 30,
          }}
        >
          <div
            style={{
              padding: "1rem",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <h3 style={{ margin: 0 }}>Team Members</h3>
            <X size={22} style={{ cursor: "pointer" }} onClick={() => setShowMembers(false)} />
          </div>

          {members.map((m) => (
            <div
              key={m.id}
              style={{
                padding: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                borderBottom: "1px solid #f1f5f9",
              }}
            >
              <Circle
                size={12}
                color={m.online ? "#10b981" : "#9ca3af"}
                fill={m.online ? "#10b981" : "#9ca3af"}
              />
              <p style={{ margin: 0, fontWeight: 600 }}>{m.name}</p>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- CHAT WINDOW ---------------- */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        
        {/* HEADER */}
        <div
          style={{
            padding: "1rem",
            background: "white",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={() => setShowMembers(true)}
            style={{ background: "transparent", border: "none" }}
          >
            <Users size={26} color="#2563eb" />
          </button>

          <h3 style={{ margin: 0 }}>General Team Chat</h3>

          <div style={{ width: "26px" }}></div>
        </div>

        {/* CHAT AREA */}
        <div
          ref={chatRef}
          style={{
            flex: 1,
            padding: "1.5rem",
            overflowY: "auto",
            background: "#e5ebf4",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {messages.map((msg) => (
            <div key={msg.id} style={{ alignSelf: msg.mine ? "flex-end" : "flex-start", maxWidth: "65%" }}>
              
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8rem",
                  color: msg.mine ? "#2563eb" : "#374151",
                  fontWeight: 600,
                }}
              >
                {msg.sender}
              </p>

              <div
                style={{
                  background: msg.mine ? "#2563eb" : "white",
                  color: msg.mine ? "white" : "#111827",
                  padding: "0.8rem 1rem",
                  borderRadius: "12px",
                  marginTop: "0.2rem",
                }}
              >
                {msg.type === "text" && msg.content}

                {msg.type === "image" && (
                  <img src={msg.fileURL} alt="" style={{ maxWidth: "100%", borderRadius: "10px" }} />
                )}

                {msg.type === "document" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <FileText size={20} />
                    <span>{msg.content}</span>
                  </div>
                )}

                {msg.type === "audio" && (
                  <audio controls style={{ width: "100%", marginTop: "5px" }}>
                    <source src={msg.fileURL} type="audio/webm" />
                  </audio>
                )}
              </div>

              <p style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "0.25rem" }}>{msg.time}</p>
            </div>
          ))}
        </div>

        {/* ---------------- ATTACHMENT POPUP ABOVE 📎 ---------------- */}
        {showAttachMenu && (
          <div
            style={{
              position: "absolute",
              bottom: "6rem",
              left: "3.8rem",
              zIndex: 50,
              background: "white",
              borderRadius: "12px",
              padding: "1rem",
              boxShadow: "0px 8px 20px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* Image */}
            <label style={{ display: "flex", gap: "0.6rem", cursor: "pointer" }}>
              <ImageIcon size={22} color="#2563eb" />
              Image
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFileUpload(e, "image")} />
            </label>

            {/* Document */}
            <label style={{ display: "flex", gap: "0.6rem", cursor: "pointer" }}>
              <FileText size={22} color="#059669" />
              Document
              <input type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: "none" }} onChange={(e) => handleFileUpload(e, "document")} />
            </label>

            {/* Voice Recording */}
            {!isRecording && (
              <button
                onClick={startRecording}
                style={{
                  background: "transparent",
                  border: "none",
                  display: "flex",
                  gap: "0.6rem",
                  cursor: "pointer",
                }}
              >
                <Mic size={22} color="#dc2626" /> Record Voice
              </button>
            )}

            {isRecording && (
              <button
                onClick={stopRecording}
                style={{
                  background: "transparent",
                  border: "none",
                  display: "flex",
                  gap: "0.6rem",
                  cursor: "pointer",
                }}
              >
                <StopCircle size={22} color="red" /> Stop Recording
              </button>
            )}
          </div>
        )}

        {/* ---------------- INPUT AREA ---------------- */}
        <div
          style={{
            padding: "1rem",
            background: "white",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          {/* 📎 PIN */}
          <button
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            style={{ background: "transparent", border: "none" }}
          >
            <Paperclip size={24} color="#6b7280" />
          </button>

          {/* IMAGE PREVIEW */}
          {imagePreview && (
            <div
              style={{
                flex: 1,
                padding: "0.6rem",
                background: "#e5e7eb",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <img src={imagePreview.url} style={{ height: "50px", borderRadius: "6px" }} />
              <X size={22} color="red" style={{ cursor: "pointer" }} onClick={() => setImagePreview(null)} />
            </div>
          )}

          {/* DOCUMENT PREVIEW */}
          {documentPreview && (
            <div
              style={{
                flex: 1,
                padding: "0.75rem",
                background: "#e5e7eb",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <FileText size={22} />
              <span>{documentPreview.name}</span>
              <X size={22} color="red" style={{ cursor: "pointer" }} onClick={() => setDocumentPreview(null)} />
            </div>
          )}

          {/* AUDIO PREVIEW */}
          {audioPreviewURL && (
            <div
              style={{
                flex: 1,
                padding: "0.6rem",
                background: "#e5e7eb",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <audio controls src={audioPreviewURL} style={{ width: "100%" }}></audio>
              <X size={22} color="red" style={{ cursor: "pointer" }} onClick={() => setAudioPreviewURL(null)} />
            </div>
          )}

          {/* TEXT INPUT (ONLY IF NO PREVIEW) */}
          {!imagePreview && !documentPreview && !audioPreviewURL && (
            <input
              type="text"
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{
                flex: 1,
                padding: "0.8rem 1rem",
                borderRadius: "20px",
                border: "1px solid #ddd",
              }}
            />
          )}

          {/* SEND BUTTON */}
          <button
            onClick={sendMessage}
            style={{
              background: "#2563eb",
              padding: "0.8rem",
              borderRadius: "50%",
              border: "none",
            }}
          >
            <Send size={20} color="white" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceDiscussion;
