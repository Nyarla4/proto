import './App.css';
import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

/**
 * 서버 주소 설정 (환경에 따라 수정 가능)
 */
const socket = io("http://localhost:3001");

function App() {
// --- 상태 관리 (State) ---
  const [name, setName] = useState("");         // 사용자의 닉네임
  const [isJoined, setIsJoined] = useState(false); // 입장 여부
  const [players, setPlayers] = useState([]);     // 접속자 목록
  const [message, setMessage] = useState("");     // 입력 중인 메시지
  const [chatLog, setChatLog] = useState([]);     // 채팅 기록

  const chatEndRef = useRef(null); // 채팅창 하단 자동 스크롤을 위한 참조

  // --- 소켓 이벤트 리스너 등록 ---
  useEffect(() => {
    // 서버로부터 플레이어 목록 업데이트 수신
    socket.on("update_players", (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });

    // 서버로부터 새 메시지 수신
    socket.on("receive_message", (data) => {
      setChatLog((prev) => [...prev, data]);
    });

    // 컴포넌트 언마운트 시 리스너 해제
    return () => {
      socket.off("update_players");
      socket.off("receive_message");
    };
  }, []);

  // 새 메시지가 올 때마다 스크롤 아래로 내리기
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);
  
  // --- 핸들러 함수 ---
  
  // 입장하기
  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim()) {
      socket.emit("join_room", name);
      setIsJoined(true);
    }
  };

  // 메시지 보내기
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      socket.emit("send_message", { message, author: name });
      setMessage("");
    }
  };

  // 준비 버튼 클릭
  const handleToggleReady = () => {
    socket.emit("toggle_ready");
  };

  // --- 화면 렌더링 ---

  // 1. 입장 전 로비 화면
  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="p-8 bg-white rounded-lg shadow-md w-96">
          <h1 className="text-2xl font-bold mb-6 text-center">라이어 게임 입장</h1>
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              placeholder="닉네임을 입력하세요"
              className="w-full p-3 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-500 text-white p-3 rounded font-semibold hover:bg-blue-600 transition"
            >
              참가하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. 게임 대기실 및 채팅 화면
  const myInfo = players.find((p) => p.id === socket.id);

  return (
    <div className="flex h-screen bg-gray-50 p-4 gap-4 overflow-hidden">
      {/* 왼쪽: 플레이어 목록 및 준비 버튼 */}
      <div className="w-1/3 flex flex-col gap-4">
        <div className="bg-white p-4 rounded-xl shadow h-full overflow-y-auto">
          <h2 className="text-xl font-bold mb-4 border-b pb-2">참가자 ({players.length})</h2>
          <div className="space-y-3">
            {players.map((player) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  player.id === socket.id ? "bg-blue-50 border border-blue-200" : "bg-gray-50"
                }`}
              >
                <div>
                  <span className="font-medium text-gray-800">{player.name}</span>
                  {player.isHost && <span className="ml-2 text-xs bg-yellow-400 text-white px-2 py-0.5 rounded-full">방장</span>}
                </div>
                <div className="text-sm font-bold">
                  {player.isReady ? (
                    <span className="text-green-500">READY</span>
                  ) : (
                    <span className="text-gray-400">WAITING</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 내 상태 변경 컨트롤 */}
        <div className="bg-white p-4 rounded-xl shadow">
          {myInfo?.isHost ? (
            <button className="w-full bg-red-500 text-white py-4 rounded-lg font-bold hover:bg-red-600 shadow-lg transition">
              게임 시작
            </button>
          ) : (
            <button
              onClick={handleToggleReady}
              className={`w-full py-4 rounded-lg font-bold shadow-lg transition ${
                myInfo?.isReady ? "bg-gray-400 text-white" : "bg-green-500 text-white hover:bg-green-600"
              }`}
            >
              {myInfo?.isReady ? "준비 취소" : "준비 하기"}
            </button>
          )}
        </div>
      </div>

      {/* 오른쪽: 채팅창 */}
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow overflow-hidden">
        <div className="bg-gray-800 text-white p-3 font-bold">실시간 채팅</div>
        
        {/* 메시지 로그 리스트 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {chatLog.map((chat) => (
            <div
              key={chat.id}
              className={`flex flex-col ${chat.author === name ? "items-end" : "items-start"}`}
            >
              <span className="text-xs text-gray-500 mb-1">{chat.author}</span>
              <div
                className={`px-3 py-2 rounded-2xl max-w-xs ${
                  chat.author === name
                    ? "bg-blue-500 text-white rounded-tr-none"
                    : "bg-gray-200 text-gray-800 rounded-tl-none"
                }`}
              >
                {chat.message}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* 메시지 입력창 */}
        <form onSubmit={handleSendMessage} className="p-4 border-t flex gap-2">
          <input
            type="text"
            className="flex-1 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="메시지를 입력하세요..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded font-bold hover:bg-blue-600 transition">
            전송
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
