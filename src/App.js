import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

// 서버 주소 설정 (배포/로컬 환경 대응)
const SOCKET_URL = window.location.hostname === 'localhost' 
  ? "http://localhost:3001" 
  : window.location.origin;

const socket = io(SOCKET_URL, {
  transports: ["websocket"]
});

function App() {
  // 방 정보 (URL 파라미터에서 가져오거나 기본값 사용)
  const urlParams = new URLSearchParams(window.location.search);
  const initialRoomId = urlParams.get('room') || 'default-room';

  const [roomId, setRoomId] = useState(initialRoomId);
  const [name, setName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  const [gameStatus, setGameStatus] = useState("LOBBY");
  const [myGameData, setMyGameData] = useState(null); 
  const [showError, setShowError] = useState(""); 
  const [currentTurnId, setCurrentTurnId] = useState(""); 
  
  const [votedCount, setVotedCount] = useState(0);
  const [gameResult, setGameResult] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [guessWord, setGuessWord] = useState("");
  const [isInfoVisible, setIsInfoVisible] = useState(true);

  const chatEndRef = useRef(null);

  useEffect(() => {
    // Tailwind CSS 주입
    const scriptId = "tailwind-cdn";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }

    // 소켓 이벤트 리스너
    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    
    socket.on("update-players", (data) => setPlayers(data));
    socket.on("chat-message", (data) => setChatLog((prev) => [...prev, data]));
    
    socket.on("join-success", () => {
      setIsJoined(true);
      setShowError("");
    });
    
    socket.on("game-start", (data) => {
      setMyGameData(data);
      setGameStatus("PLAYING");
      setGameResult(null);
      setHasVoted(false);
      setVotedCount(0);
      setGuessWord("");
    });

    socket.on("update-game-status", (status) => setGameStatus(status));
    socket.on("update-turn", (id) => setCurrentTurnId(id));
    socket.on("update-voted-count", (count) => setVotedCount(count));
    
    socket.on("game-result", (result) => {
      setGameResult(result);
      setGameStatus("RESULT");
    });

    socket.on("error-message", (msg) => {
      setShowError(msg);
      setTimeout(() => setShowError(""), 3000);
    });

    return () => {
      socket.off("update-players");
      socket.off("chat-message");
      socket.off("join-success");
      socket.off("game-start");
      socket.off("update-game-status");
      socket.off("update-turn");
      socket.off("update-voted-count");
      socket.off("game-result");
      socket.off("error-message");
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  // 핸들러 함수들
  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim() && roomId.trim()) {
      socket.emit("join-room", { roomId, name });
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim())  {
      setShowError("채팅 내용은 공백일 수 없습니다.");
      setTimeout(() => setShowError(""), 2000);
      return;
    }
    socket.emit("send-message", { roomId, message });
    setMessage("");
  };

  const handleToggleReady = () => socket.emit("toggle-ready");
  const handleStartGame = () => socket.emit("start-game", roomId);
  const handleNextTurn = () => socket.emit("next-turn");
  
  const handleVote = (targetId) => {
    if (hasVoted) return;
    socket.emit("submit-vote", targetId);
    setHasVoted(true);
  };

  const handleSubmitGuess = (e) => {
    e.preventDefault();
    if (guessWord.trim()) {
      socket.emit("submit-guess", guessWord);
    }
  };

  // 입장 전 화면
  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4 relative">
        {showError && (
          <div className="absolute top-10 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl z-50 animate-bounce font-black text-sm uppercase">
            ⚠ {showError}
          </div>
        )}
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl w-full max-w-md border border-slate-200 text-center flex flex-col gap-6">
          <div>
            <h1 className="text-5xl font-black text-blue-600 tracking-tighter italic uppercase mb-2">Liar Game</h1>
            <p className="text-slate-400 font-bold text-sm tracking-widest uppercase">Multi-Room Edition</p>
          </div>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Room ID</label>
              <input
                type="text"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-2xl outline-none font-bold text-center"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Nickname</label>
              <input
                type="text"
                placeholder="닉네임 입력"
                className="w-full p-5 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-2xl outline-none font-bold text-center"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={10}
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 uppercase active:scale-95">입장하기</button>
          </form>
          <div className="flex items-center justify-center gap-2 text-slate-300 font-bold text-[10px] uppercase tracking-widest">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            {isConnected ? 'Server Connected' : 'Connecting...'}
          </div>
        </div>
      </div>
    );
  }

  const myInfo = players.find(p => p.id === socket.id);
  const isMyTurn = currentTurnId === socket.id;
  const isLiar = myGameData?.role === "LIAR";

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden text-slate-800 font-sans">
      {/* 에러 메시지 알림 */}
      {showError && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl z-50 animate-bounce font-black text-sm uppercase">
          ⚠ {showError}
        </div>
      )}

      {/* 모바일 상단 바 */}
      <div className="md:hidden bg-white/80 backdrop-blur-sm p-3 flex justify-between items-center border-b shrink-0 z-40">
        <span className="font-black italic text-slate-800 tracking-tighter">🕵️ {roomId.toUpperCase()}</span>
        <button 
          onClick={() => setIsInfoVisible(!isInfoVisible)}
          className="bg-slate-800 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
        >
          {isInfoVisible ? "HIDE INFO" : "SHOW INFO"}
        </button>
      </div>

      <div className="flex flex-col md:flex-row flex-1 p-2 md:p-4 gap-2 md:gap-4 overflow-hidden">
        
        {/* 왼쪽 정보창 */}
        <div className={`
          ${isInfoVisible ? 'flex' : 'hidden'} 
          md:flex w-full md:w-1/3 flex-col gap-2 md:gap-4 overflow-hidden h-full shrink-0
          max-h-[50vh] md:max-h-full transition-all duration-300
        `}>
          {/* 내 정보 */}
          <div className="bg-white p-3 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 shrink-0 flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-16 md:h-16 bg-blue-100 rounded-full flex items-center justify-center shrink-0 border-2 md:border-4 border-white shadow-inner text-lg md:text-2xl">
              👤
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-black text-base md:text-xl text-slate-900 leading-none truncate max-w-[100px] md:max-w-none">{name}</span>
                <span className="bg-blue-600 text-white text-[8px] md:text-[10px] px-1.5 py-0.5 rounded-full font-black uppercase">Me</span>
              </div>
              <span className="text-slate-400 text-[9px] md:text-xs font-bold mt-1 uppercase">
                SCORE: <span className="text-blue-600">{myInfo?.score || 0}</span> | {myInfo?.isHost ? "HOST 👑" : "MEMBER"}
              </span>
            </div>
          </div>

          {/* 플레이어 리스트 및 상태 */}
          <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-base md:text-xl font-black mb-2 md:mb-4 border-b pb-2 flex justify-between items-center shrink-0 uppercase italic">
              <span>
                {gameStatus === "LOBBY" ? "🏠 Lobby" :
                  gameStatus === "VOTING" ? "🗳 Voting" :
                    gameStatus === "LIAR_GUESS" ? "🤔 Liar's Turn" :
                      gameStatus === "RESULT" ? "🏆 Result" : "🎮 Playing"}
              </span>
            </h2>
            
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 단어 표시 */}
              {(gameStatus === "PLAYING" || gameStatus === "VOTING" || gameStatus === "LIAR_GUESS") && myGameData && (
                <div className="mb-3 p-3 bg-blue-50 rounded-2xl text-center border border-blue-100 shrink-0">
                  <p className="text-[8px] text-blue-400 font-black mb-0.5 uppercase tracking-widest">Category: {myGameData.category}</p>
                  <p className="text-xl md:text-2xl font-black text-blue-900 tracking-tighter">{myGameData.word}</p>
                </div>
              )}

              {/* 플레이어 목록 */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {players.map((p) => (
                  <div key={p.id} className={`p-3 md:p-4 rounded-xl flex justify-between items-center border-2 transition-all ${
                    currentTurnId === p.id ? "bg-amber-50 border-amber-400 shadow-sm" : "bg-white border-slate-50"
                  } ${socket.id === p.id ? "ring-1 ring-blue-400" : ""}`}>
                    <div className="flex items-center gap-2 truncate">
                      <span className={`font-bold text-xs md:text-sm truncate ${socket.id === p.id ? "text-blue-700 font-black" : "text-slate-700"}`}>
                        {p.name} {p.isHost && "👑"}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {p.score || 0}pt
                      </span>
                      {currentTurnId === p.id && gameStatus === "PLAYING" && (
                        <span className="text-[8px] bg-amber-400 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse uppercase">Turn</span>
                      )}
                    </div>
                    {gameStatus === "VOTING" && !hasVoted && p.id !== socket.id && (
                      <button
                        onClick={() => handleVote(p.id)}
                        className="bg-rose-500 text-white text-[10px] px-3 py-1 rounded-lg font-black hover:bg-rose-600 transition-colors uppercase shadow-sm"
                      >
                        지목
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-200 shrink-0">
            {gameStatus === "LOBBY" ? (
              myInfo?.isHost ? (
                <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 active:scale-95 shadow-xl shadow-blue-100 uppercase italic">게임 시작</button>
              ) : (
                <button onClick={handleToggleReady} className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${myInfo?.isReady ? "bg-slate-200 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
                  {myInfo?.isReady ? "READY OK" : "READY"}
                </button>
              )
            ) : gameStatus === "VOTING" ? (
              <div className="text-center py-4 bg-rose-50 rounded-2xl border-2 border-dashed border-rose-200 font-black uppercase text-xs text-rose-600 animate-pulse">
                {hasVoted ? `VOTED (${votedCount}/${players.length})` : "SELECT THE LIAR!"}
              </div>
            ) : gameStatus === "LIAR_GUESS" ? (
              isLiar ? (
                <form onSubmit={handleSubmitGuess} className="space-y-2">
                  <input 
                    type="text" 
                    value={guessWord} 
                    onChange={(e) => setGuessWord(e.target.value)}
                    placeholder="시민의 단어를 입력하세요"
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl outline-none font-bold text-center focus:border-rose-400 transition-all text-sm"
                  />
                  <button className="w-full bg-rose-600 text-white py-3 rounded-xl font-black hover:bg-rose-700 shadow-lg uppercase italic">정답 제출</button>
                </form>
              ) : (
                <div className="text-center py-4 bg-blue-50 rounded-2xl border-2 border-dashed border-blue-200 text-blue-600 font-black text-xs animate-pulse">LIAR IS GUESSING...</div>
              )
            ) : gameStatus === "RESULT" ? (
              myInfo?.isHost && <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl uppercase italic">다시 시작</button>
            ) : isMyTurn ? (
              <button onClick={handleNextTurn} className="w-full bg-amber-400 text-amber-900 py-4 rounded-2xl font-black text-lg hover:bg-amber-500 animate-pulse uppercase italic border-b-4 border-amber-600">설명 완료</button>
            ) : (
              <div className="text-center py-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 font-black text-xs italic animate-pulse">DESCRIBING...</div>
            )}
          </div>
        </div>

        {/* 오른쪽 채팅창 */}
        <div className="flex-1 bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full min-h-0">
          <div className="p-4 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center shrink-0">
            <h3 className="font-black text-slate-800 italic uppercase text-xs flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span> {roomId.toUpperCase()} CHAT
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/10">
             {chatLog.map((chat) => (
                <div key={chat.id} className={`flex flex-col ${chat.author === name ? "items-end" : "items-start"}`}>
                  <span className={`text-[9px] font-black mb-1 px-2 uppercase tracking-tighter ${chat.author === 'SYSTEM' ? 'text-blue-500' : 'text-slate-400'}`}>
                    {chat.author === name ? "Me" : chat.author}
                  </span>
                  <div className={`px-4 py-2 rounded-[1.2rem] max-w-[85%] break-all shadow-sm font-medium text-sm ${
                    chat.author === 'SYSTEM' ? "bg-slate-800 text-white mx-auto text-center rounded-2xl text-[11px] py-1.5" :
                    chat.author === name ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
                  }`}>
                    {chat.message}
                  </div>
                </div>
              ))}
            <div ref={chatEndRef} />
          </div>
          
          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-50 flex gap-2 shrink-0">
            <input
              className="flex-1 p-3 bg-slate-50 rounded-xl outline-none font-bold text-slate-700 focus:bg-white border-2 border-transparent focus:border-blue-100 transition-all text-sm"
              placeholder="메시지 전송..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="bg-blue-600 text-white px-6 rounded-xl font-black hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-50 uppercase italic text-sm">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;