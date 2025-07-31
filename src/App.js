import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useSearchParams } from "react-router-dom";

const socket = io("https://yayin-backend.onrender.com");

const App = () => {
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get("role");
  const [role, setRole] = useState(roleParam || null);
  const [roomId] = useState("ekran-yayini");
  const [broadcasterName, setBroadcasterName] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [name, setName] = useState("");
  const peers = useRef({});

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (!role || !name) return;

    if (role === "broadcaster") {
      setBroadcasterName(name);

      navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then(stream => {
        localVideoRef.current.srcObject = stream;

        socket.on("user-joined", async (id) => {
          const pc = new RTCPeerConnection();
          peers.current[id] = pc;

          stream.getTracks().forEach(track => pc.addTrack(track, stream));

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit("ice-candidate", {
                to: id,
                candidate: event.candidate,
              });
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("offer", { to: id, offer });
        });
      });
    }

    if (role === "viewer") {
      socket.on("offer", async ({ from, offer }) => {
        const pc = new RTCPeerConnection();
        peers.current[from] = pc;

        pc.ontrack = (event) => {
          remoteVideoRef.current.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("ice-candidate", {
              to: from,
              candidate: event.candidate,
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("answer", { to: from, answer });
      });
    }

    socket.on("answer", async ({ from, answer }) => {
      await peers.current[from]?.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
      try {
        await peers.current[from]?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("ICE eklenemedi:", err);
      }
    });

    socket.emit("join", roomId);

    const handleChatMessage = ({ sender, message }) => {
      setChatMessages(prev => [...prev, { sender, message }]);
    };

    socket.on("chat-message", handleChatMessage);

    return () => {
      socket.off("chat-message", handleChatMessage);
    };
  }, [role, roomId, name]);

  const sendMessage = () => {
    if (newMessage.trim() === "") return;

    socket.emit("chat-message", {
      room: roomId,
      sender: name || "Anonim",
      message: newMessage,
    });

    setNewMessage("");
  };

  if (!role) {
    return (
      <div style={{ textAlign: "center", marginTop: 50 }}>
        <h2>Önce ismini yaz 👇</h2>
        <input
          type="text"
          placeholder="Adınız"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 10, fontSize: 16 }}
        />
        <div style={{ marginTop: 20 }}>
          <h2>Şimdi rolünü seç</h2>
          <button
            onClick={() => name.trim() && setRole("broadcaster")}
            disabled={!name.trim()}
            style={{ padding: "10px 20px", marginRight: 10 }}
          >
            📤 Yayıncı Ol
          </button>
          <button
            onClick={() => name.trim() && setRole("viewer")}
            disabled={!name.trim()}
            style={{ padding: "10px 20px" }}
          >
            👀 İzleyici Ol
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>{role === "broadcaster" ? "🖥️ Ekran Paylaşımı" : "📺 Yayını İzliyorsun"}</h1>

      {role === "broadcaster" && (
        <video ref={localVideoRef} autoPlay muted playsInline width="45%" />
      )}
      <video ref={remoteVideoRef} autoPlay playsInline width="45%" />

      <div style={{ marginTop: 20 }}>
        <input
          type="text"
          placeholder="Adınz"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 5 }}
        />
      </div>

      <div style={{
        border: "1px solid gray",
        height: 200,
        overflowY: "auto",
        margin: "10px 0",
        padding: 10
      }}>
        {chatMessages.map((msg, i) => (
          <div
            key={i}
            style={{ color: msg.sender === broadcasterName ? "crimson" : "black" }}
          >
            <strong>{msg.sender}:</strong> {msg.message}
          </div>
        ))}
      </div>

      <div>
        <input
          type="text"
          placeholder="Mesaj yaz..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          style={{ width: 250, padding: 5 }}
        />
        <button onClick={sendMessage} style={{ marginLeft: 5, padding: "5px 10px" }}>
          Gönder
        </button>
      </div>
    </div>
  );
};

export default App;
