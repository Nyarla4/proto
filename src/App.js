import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = window.location.hostname === 'localhost'
  ? "http://localhost:3001"
  : window.location.origin;

const socket = io(SOCKET_URL, {
  transports: ["websocket"]
});

function App() {
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
  const [descInput, setDescInput] = useState("");
  const [isInfoVisible, setIsInfoVisible] = useState(true);

  // 타이머 상태
  const [timeLeft, setTimeLeft] = useState(0);

  const chatEndRef = useRef(null);
  const descInputRef = useRef("");
  const guessWordRef = useRef(""); 
  const currentTurnIdRef = useRef("");
  const gameStatusRef = useRef("LOBBY");

  useEffect(() => { descInputRef.current = descInput; }, [descInput]);
  useEffect(() => { guessWordRef.current = guessWord; }, [guessWord]);
  useEffect(() => { currentTurnIdRef.current = currentTurnId; }, [currentTurnId]);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);

  useEffect(() => {
    const scriptId = "tailwind-cdn";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }

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
      setDescInput("");
    });

    socket.on("update-game-status", (status) => setGameStatus(status));
    socket.on("update-turn", (id) => setCurrentTurnId(id));
    socket.on("update-voted-count", (count) => setVotedCount(count));

    socket.on("timer-tick", (time) => {
      setTimeLeft(time);
      if (time === 0) {
        if (gameStatusRef.current === "PLAYING" && currentTurnIdRef.current === socket.id) {
          socket.emit("next-turn", descInputRef.current || "시간 초과로 설명을 건너뜁니다.");
          setDescInput("");
        }
        if (gameStatusRef.current === "LIAR_GUESS" && myGameData?.role === "LIAR") {
          socket.emit("submit-guess", guessWordRef.current || "시간 초과");
          setGuessWord("");
        }
      }
    });

    socket.on("game-result", (result) => {
      setGameResult(result);
      setGameStatus("RESULT");
      setTimeLeft(0);
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
      socket.off("timer-tick");
      socket.off("game-result");
      socket.off("error-message");
    };
  }, [myGameData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim() && roomId.trim()) {
      socket.emit("join-room", { roomId, name });
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) {
      setShowError("채팅 내용은 공백일 수 없습니다.");
      setTimeout(() => setShowError(""), 2000);
      return;
    }
    socket.emit("send-message", { roomId, message });
    setMessage("");
  };

  const handleToggleReady = () => socket.emit("toggle-ready");
  const handleStartGame = () => socket.emit("start-game", roomId);

  const handleDescInputChange = (e) => {
    const val = e.target.value;
    setDescInput(val);
    if (currentTurnId === socket.id) {
      socket.emit("update-input", val);
    }
  };

  const handleGuessInputChange = (e) => {
    const val = e.target.value;
    setGuessWord(val);
    if (gameStatus === 'LIAR_GUESS') {
      socket.emit("update-input", val);
    }
  };

  const handleNextTurn = (e) => {
    if (e) e.preventDefault();
    if (!descInput.trim()) {
      setShowError("단어에 대한 설명을 입력해주세요.");
      return;
    }
    socket.emit("next-turn", descInput);
    setDescInput("");
  };

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

  const handleExit = () => {
    if (!window.confirm("정말 방에서 나가시겠습니까?")) return;
    socket.disconnect();
    setIsJoined(false);
    setGameStatus("LOBBY");
    setChatLog([]);
    socket.connect();
  };

  // 공통 변수 계산
  const myInfo = players.find(p => p.id === socket.id);
  const isMyTurn = currentTurnId === socket.id && gameStatus === "PLAYING";
  const isLiar = myGameData?.role === "LIAR";
  const isSpectator = myInfo?.userType === 'SPECTATOR';
  const activePlayersCount = players.filter(p => p.userType === 'PLAYER').length;
  const isTimerActive = ["PLAYING", "VOTING", "LIAR_GUESS"].includes(gameStatus);

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4 relative font-sans">
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

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden text-slate-800 font-sans relative">
      {/* 에러 알림 */}
      {showError && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl z-[100] animate-bounce font-black text-sm uppercase">
          ⚠ {showError}
        </div>
      )}

      {/* [모달 통합] 내 차례일 때 중앙 입력 모달 */}
      {isMyTurn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border-4 border-amber-400 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-amber-400 p-4 text-center">
              <span className="text-amber-900 font-black text-xl italic uppercase tracking-tighter">Your Turn!</span>
            </div>
            <div className="p-8 flex flex-col gap-6">
              <div className="text-center">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1">Your Word</p>
                <h2 className="text-4xl font-black text-slate-900 tracking-tighter italic uppercase">{myGameData?.word}</h2>
              </div>
              <form onSubmit={handleNextTurn} className="space-y-4">
                <input
                  autoFocus
                  type="text"
                  value={descInput}
                  onChange={handleDescInputChange}
                  placeholder="단어에 대해 설명해주세요..."
                  className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] outline-none font-black text-center text-xl focus:border-amber-400 transition-all"
                />
                <div className="flex flex-col gap-2">
                  <button type="submit" className="w-full bg-amber-400 text-amber-900 py-5 rounded-[1.5rem] font-black text-xl hover:bg-amber-500 shadow-xl shadow-amber-100 uppercase italic border-b-4 border-amber-600 active:translate-y-1 active:border-b-0 transition-all">
                    설명 완료 ({timeLeft}s)
                  </button>
                  <p className="text-[10px] text-center text-slate-400 font-bold uppercase">설명을 마치면 자동으로 다음 사람에게 턴이 넘어갑니다.</p>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* [모달 통합] 라이어 정답 추리 모달 */}
      {gameStatus === "LIAR_GUESS" && isLiar && !isSpectator && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rose-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border-4 border-rose-500 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-rose-500 p-4 text-center">
              <span className="text-white font-black text-xl italic uppercase tracking-tighter">Guess the Word!</span>
            </div>
            <div className="p-8 flex flex-col gap-6">
              <div className="text-center">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1">You are the LIAR</p>
                <h2 className="text-2xl font-black text-rose-600 tracking-tighter italic uppercase">시민들의 제시어를 맞히세요</h2>
              </div>
              <form onSubmit={handleSubmitGuess} className="space-y-4">
                <input
                  autoFocus
                  type="text"
                  value={guessWord}
                  onChange={handleGuessInputChange}
                  placeholder="정답 입력..."
                  className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] outline-none font-black text-center text-xl focus:border-rose-500 transition-all"
                />
                <button className="w-full bg-rose-600 text-white py-5 rounded-[1.5rem] font-black text-xl hover:bg-rose-700 shadow-xl shadow-rose-100 uppercase italic border-b-4 border-rose-800 active:translate-y-1 active:border-b-0 transition-all">
                  정답 제출 ({timeLeft}s)
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 모바일 헤더 */}
      <div className="md:hidden bg-white/80 backdrop-blur-sm p-3 flex justify-between items-center border-b shrink-0 z-40">
        <span className="font-black italic text-slate-800 tracking-tighter">🕵️ {roomId.toUpperCase()}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsInfoVisible(!isInfoVisible)}
            className="bg-slate-800 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
          >
            {isInfoVisible ? "HIDE INFO" : "SHOW INFO"}
          </button>
          <button
            onClick={handleExit}
            className="bg-rose-50 text-rose-600 border-2 border-rose-200 px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm active:scale-95 transition-all duration-300 hover:bg-rose-600 hover:text-white hover:border-rose-600"
          >
            EXIT ROOM
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 p-2 md:p-4 gap-2 md:gap-4 overflow-hidden">
        {/* 좌측 패널: 플레이어 정보 및 상태 */}
        <div className={`
          ${isInfoVisible ? 'flex' : 'hidden'} 
          md:flex w-full md:w-1/3 flex-col gap-2 md:gap-4 overflow-hidden h-full shrink-0
          max-h-[50vh] md:max-h-full transition-all duration-300
        `}>
          {/* 프로필 카드 */}
          <div className="bg-white p-3 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 shrink-0 flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-16 md:h-16 bg-blue-100 rounded-full flex items-center justify-center shrink-0 border-2 md:border-4 border-white shadow-inner text-lg md:text-2xl">
              👤
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-black text-base md:text-xl text-slate-900 leading-none truncate max-w-[100px] md:max-w-none">{name}</span>
                <span className="bg-blue-600 text-white text-[8px] md:text-[10px] px-1.5 py-0.5 rounded-full font-black uppercase">Me</span>
                {isSpectator && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter shrink-0 border bg-indigo-50 border-indigo-200 text-indigo-600 ml-1">
                    Spectator
                  </span>
                )}
              </div>
              <span className="text-slate-400 text-[9px] md:text-xs font-bold mt-1 uppercase">
                SCORE: <span className="text-blue-600">{myInfo?.score || 0}</span> | {myInfo?.isHost ? "HOST 👑" : "MEMBER"}
              </span>
            </div>
            {isTimerActive && (
              <div className={`ml-auto px-4 py-2 rounded-2xl border-2 font-black text-xl ${timeLeft <= 5 ? 'bg-rose-50 border-rose-400 text-rose-600 animate-pulse' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                {timeLeft}s
              </div>
            )}
          </div>

          {/* 플레이어 리스트 카드 */}
          <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-base md:text-xl font-black mb-2 md:mb-4 border-b pb-2 flex justify-between items-center shrink-0 uppercase italic text-slate-400">
              {gameStatus === "LOBBY" ? "🏠 Lobby" :
               gameStatus === "VOTING" ? "🗳 Voting" :
               gameStatus === "LIAR_GUESS" ? "🤔 Liar's Turn" :
               gameStatus === "RESULT" ? "🏆 Result" : "🎮 Playing"}
            </h2>

            <div className="flex-1 flex flex-col overflow-hidden">
              {/* 내 카드 정보 (고정) */}
              {(gameStatus === "PLAYING" || gameStatus === "VOTING" || gameStatus === "LIAR_GUESS") && myGameData && (
                <div className="mb-3 p-4 bg-blue-600 rounded-[1.5rem] text-center shadow-lg shadow-blue-100 shrink-0">
                  <p className="text-[8px] text-blue-200 font-black mb-0.5 uppercase tracking-widest">Category: {myGameData.category}</p>
                  <p className="text-2xl font-black text-white tracking-tighter italic uppercase">{myGameData.word}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {players.map((p) => (
                  <div key={p.id}
                    className={`p-3 md:p-4 rounded-2xl flex justify-between items-center border-2 transition-all ${currentTurnId === p.id ? "bg-amber-50 border-amber-400 shadow-md" : "bg-white border-slate-50"
                      } ${socket.id === p.id ? "ring-2 ring-blue-600/10" : ""}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        {p.isHost && <span className="text-xs">👑</span>}
                        <span className={`font-black text-xs md:text-sm truncate ${socket.id === p.id ? "text-blue-600" : "text-slate-700"}`}>
                          {p.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
                        {p.score || 0}P
                      </span>
                      {currentTurnId === p.id && gameStatus === "PLAYING" && (
                        <span className="text-[8px] bg-amber-400 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse uppercase shrink-0">Turn</span>
                      )}
                      {((gameStatus === "LOBBY" || gameStatus === "RESULT") && !p.isHost) ? (
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter shrink-0 border ${p.isReady
                          ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                          : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}>
                          {p.isReady ? "Ready" : "Wait"}
                        </span>
                      ) : p.userType === "SPECTATOR" && (
                        <span className={"text-[9px] font-black px-2 py-0.5 rounded-md uppercase border bg-indigo-50 border-indigo-200 text-indigo-600"}>Spectator</span>
                      )}
                    </div>
                    {gameStatus === "VOTING" && !hasVoted && !isSpectator && p.id !== socket.id && p.userType === 'PLAYER' && (
                      <button
                        onClick={() => handleVote(p.id)}
                        className="bg-rose-500 text-white text-[10px] px-3 py-1.5 rounded-xl font-black hover:bg-rose-600 transition-colors uppercase italic shadow-sm"
                      >
                        VOTE
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 하단 컨트롤 바 (로비 전용) */}
          <div className="bg-white p-3 rounded-[1.5rem] border border-slate-200 shadow-sm">
            {gameStatus === "LOBBY" ? (
              myInfo?.isHost ? (
                <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 shadow-lg shadow-blue-100 uppercase italic">Start Game</button>
              ) : (
                <button onClick={handleToggleReady} className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${myInfo?.isReady ? "bg-slate-200 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-100"}`}>
                  {myInfo?.isReady ? "준비완료" : "준비"}
                </button>
              )
            ) : gameStatus === "RESULT" ? (
                myInfo?.isHost ? (
                  <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 uppercase italic">다시 시작</button>
                ) : (
                  <button onClick={handleToggleReady} className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${myInfo?.isReady ? "bg-slate-200 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
                  {myInfo?.isReady ? "준비완료" : "준비"}
                </button>
                )
            ) : (
              <div className="text-center py-2 text-[10px] font-black text-slate-300 uppercase tracking-widest italic animate-pulse">
                {gameStatus} in progress
              </div>
            )}
          </div>
        </div>

        {/* 우측 패널: 채팅 및 시스템 알림 */}
        <div className="flex-1 bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full min-h-0">
          <div className="p-4 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center shrink-0">
            <h3 className="font-black text-slate-800 italic uppercase text-xs flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span> {roomId.toUpperCase()} CHAT
            </h3>
            <button
              onClick={handleExit}
              className="hidden md:flex text-[10px] font-black px-4 py-2 rounded-xl uppercase border-2 border-rose-100 bg-white text-rose-500 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all duration-300"
            >
              Exit Room
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
            {chatLog.map((chat, idx) => (
              <div key={idx} className={`flex flex-col ${chat.author === name ? "items-end" : chat.author === 'SYSTEM_DESC' ? "items-center" : "items-start"}`}>
                {chat.author !== 'SYSTEM_DESC' && (
                  <span className={`text-[9px] font-black mb-1 px-2 uppercase tracking-tighter ${chat.author === 'SYSTEM' ? 'text-blue-500' : 'text-slate-400'}`}>
                    {chat.author === name ? "Me" : chat.author}
                  </span>
                )}
                <div className={`px-5 py-3 rounded-[1.5rem] max-w-[85%] break-all shadow-sm font-bold text-sm ${
                  chat.author === 'SYSTEM' ? "bg-slate-900 text-white mx-auto text-center rounded-2xl text-[10px] py-1.5 uppercase" :
                  chat.author === 'SYSTEM_DESC' ? "bg-blue-600 text-white rounded-[1.5rem] w-full text-center py-6 font-black italic text-xl shadow-xl shadow-blue-100 scale-[0.98] animate-in slide-in-from-bottom-2" :
                  chat.author === name ? "bg-blue-600 text-white rounded-tr-none shadow-blue-100" : "bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none"
                }`}>
                  {chat.message}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-50 flex gap-2 shrink-0">
            <input
              className="flex-1 p-4 bg-slate-50 rounded-2xl outline-none font-black text-slate-700 focus:bg-white border-2 border-transparent focus:border-blue-100 transition-all text-sm"
              placeholder="메시지 전송..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="bg-blue-600 text-white px-8 rounded-2xl font-black hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-100 uppercase italic text-sm">Send</button>
          </form>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
}

export default App;