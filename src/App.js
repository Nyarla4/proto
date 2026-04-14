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

  const [isMinimized, setIsMinimized] = useState(false);

  const [timeLeft, setTimeLeft] = useState(0);
  const [timeMax, setTimeMax] = useState(0);

  const [roomSettings, setRoomSettings] = useState({
    allCategories: [],
    selectedCategories: []
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode !== null) return savedMode === 'true';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

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
    if (socket.connected) setIsConnected(true);
    socket.on("connect", () => setIsConnected(true));
    socket.on("connect_error", (err) => console.error("❌ 소켓 연결 에러 발생:", err.message));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("update-players", (data) => setPlayers(data));
    socket.on("chat-message", (data) => setChatLog((prev) => [...prev, data]));
    socket.on("join-success", () => { setIsJoined(true); setShowError(""); });
    socket.on("game-start", (data) => {
      setMyGameData(data); setGameStatus("PLAYING"); setGameResult(null);
      setHasVoted(false); setVotedCount(0); setGuessWord(""); setDescInput(""); setIsMinimized(false);
    });
    socket.on("update-game-status", (status) => {
      setGameStatus(status);
      if (status === "LIAR_GUESS" && myGameData?.role === "LIAR") setIsMinimized(false);
    });
    socket.on("update-turn", (id) => {
      setCurrentTurnId(id);
      if (id === socket.id) setIsMinimized(false);
    });
    socket.on("update-voted-count", (count) => setVotedCount(count));
    socket.on("timer-tick", (time, maxTime) => {
      setTimeLeft(time); setTimeMax(maxTime);
      if (time === 0) {
        if (gameStatusRef.current === "PLAYING" && currentTurnIdRef.current === socket.id) {
          socket.emit("next-turn", descInputRef.current || "시간 초과");
          setDescInput("");
        }
        if (gameStatusRef.current === "LIAR_GUESS" && myGameData?.role === "LIAR") {
          socket.emit("submit-guess", guessWordRef.current || "시간 초과");
          setGuessWord("");
        }
      }
    });
    socket.on("game-result", (result) => {
      setGameResult(result); setGameStatus("RESULT"); setTimeLeft(0);
    });
    socket.on("error-message", (msg) => {
      setShowError(msg); setTimeout(() => setShowError(""), 3000);
    });
    socket.on('update-room-settings', (settings) => {
      if (settings) setRoomSettings({ allCategories: settings.allCategories || [], selectedCategories: settings.selectedCategories || [] });
    });

    return () => {
      socket.off("update-players"); socket.off("chat-message"); socket.off("join-success");
      socket.off("game-start"); socket.off("update-game-status"); socket.off("update-turn");
      socket.off("update-voted-count"); socket.off("timer-tick"); socket.off("game-result");
      socket.off("error-message"); socket.off('update-room-settings');
    };
  }, [myGameData]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatLog]);

  useEffect(() => {
    if (isDarkMode) { document.documentElement.classList.add('dark'); localStorage.setItem('darkMode', 'true'); }
    else { document.documentElement.classList.remove('dark'); localStorage.setItem('darkMode', 'false'); }
  }, [isDarkMode]);

  const handleJoin = (e) => { e.preventDefault(); if (name.trim() && roomId.trim()) socket.emit("join-room", { roomId, name }); };
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) { setShowError("공백 불가"); setTimeout(() => setShowError(""), 2000); return; }
    socket.emit("send-message", { roomId, message }); setMessage("");
  };
  const handleToggleReady = () => socket.emit("toggle-ready");
  const handleStartGame = () => socket.emit("start-game", roomId);
  const handleDescInputChange = (e) => {
    const val = e.target.value; setDescInput(val);
    if (currentTurnId === socket.id) socket.emit("update-input", val);
  };
  const handleGuessInputChange = (e) => {
    const val = e.target.value; setGuessWord(val);
    if (gameStatus === 'LIAR_GUESS') socket.emit("update-input", val);
  };
  const handleNextTurn = (e) => {
    if (e) e.preventDefault();
    if (!descInput.trim()) { setShowError("설명 입력 요망"); setTimeout(() => setShowError(""), 2000); return; }
    socket.emit("next-turn", descInput); setDescInput("");
  };
  const handleVote = (targetId) => { if (hasVoted) return; socket.emit("submit-vote", targetId); setHasVoted(true); };
  const handleSubmitGuess = (e) => { e.preventDefault(); if (guessWord.trim()) socket.emit("submit-guess", guessWord); };
  const handleExit = () => {
    if (!window.confirm("방에서 나가시겠습니까?")) return;
    socket.disconnect(); setIsJoined(false); setGameStatus("LOBBY"); setChatLog([]); socket.connect();
  };

  const myInfo = players.find(p => p.id === socket.id);
  const isMyTurn = currentTurnId === socket.id && gameStatus === "PLAYING";
  const isLiar = myGameData?.role === "LIAR";
  const isSpectator = myInfo?.userType === 'SPECTATOR';
  const amIHost = myInfo?.isHost;
  const isTimerActive = ["PLAYING", "VOTING", "LIAR_GUESS"].includes(gameStatus);

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 dark:bg-slate-900 p-4 relative font-sans transition-colors duration-300">
        <button onClick={() => setIsDarkMode(prev => !prev)} className="fixed top-4 right-4 p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors z-[100] w-10 h-10 text-xl hover:bg-slate-50 dark:hover:bg-slate-700" title="다크모드 토글">
          {isDarkMode ? '🌙' : '☀️'}
        </button>
        {showError && <div className="absolute top-10 bg-[#FF59A9] text-white px-8 py-4 rounded-2xl shadow-2xl z-50 animate-bounce font-black text-sm uppercase">⚠ {showError}</div>}
        <div className="bg-white dark:bg-slate-800 p-10 rounded-[3rem] shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 text-center flex flex-col gap-6 transition-colors">
          <div>
            <h1 className="text-5xl font-black text-[#4260FF] dark:text-[#B3C8F6] tracking-tighter italic uppercase mb-2">Liar Game</h1>
            <p className="text-[#9489D5] dark:text-[#BFB8E8] font-bold text-sm tracking-widest uppercase">Multi-Room Edition</p>
          </div>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 ml-2 uppercase">Room ID</label>
              <input type="text" className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 focus:border-[#4260FF] dark:focus:border-[#B3C8F6] rounded-2xl outline-none font-bold text-center text-slate-900 dark:text-white transition-colors" value={roomId} onChange={(e) => setRoomId(e.target.value)} required />
            </div>
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 ml-2 uppercase">Nickname</label>
              <input type="text" placeholder="닉네임 입력" className="w-full p-5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 focus:border-[#4260FF] dark:focus:border-[#B3C8F6] rounded-2xl outline-none font-bold text-center text-slate-900 dark:text-white transition-colors" value={name} onChange={(e) => setName(e.target.value)} required maxLength={10} />
            </div>
            <button type="submit" className="w-full bg-[#4260FF] hover:bg-[#4260FF]/90 text-white p-5 rounded-2xl font-black text-xl transition-all shadow-xl shadow-[#4260FF]/20 uppercase active:scale-95">입장하기</button>
          </form>
          <div className="flex items-center justify-center gap-2 text-slate-300 dark:text-slate-600 font-bold text-[10px] uppercase tracking-widest">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-[#FF59A9]'}`}></span>
            {isConnected ? 'Server Connected' : 'Connecting...'}
          </div>
        </div>
      </div>
    );
  }

  const gaugeWidth = timeMax > 0 ? Math.min(100, (timeLeft / timeMax) * 100) : 0;

  return (
    <div className="flex flex-col h-screen bg-slate-100 dark:bg-slate-900 overflow-hidden text-slate-800 dark:text-slate-100 font-sans relative transition-colors duration-300">
      {showError && <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-[#FF59A9] text-white px-8 py-4 rounded-2xl shadow-2xl z-[100] animate-bounce font-black text-sm uppercase">⚠ {showError}</div>}

      {/* 내 차례 설명 모달 */}
      {isMyTurn && !isMinimized && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-900/80 backdrop-blur-sm transition-colors">
          <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden w-full max-w-lg animate-in zoom-in-95 transition-colors">
            <div className="h-2 bg-slate-100 dark:bg-slate-700 w-full overflow-hidden">
              <div className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 5 ? 'bg-[#FF59A9]' : 'bg-[#4260FF]'}`} style={{ width: `${gaugeWidth}%` }} />
            </div>
            <div className="bg-[#4260FF] dark:bg-[#4260FF]/80 p-4 flex justify-between items-center relative transition-colors">
              <span className="text-white font-black italic uppercase tracking-tighter text-xl mx-auto">Your Turn</span>
              <button onClick={() => setIsMinimized(true)} className="text-white/80 hover:text-white transition-colors p-1 absolute right-6"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg></button>
            </div>
            <div className="p-8 flex flex-col gap-6 text-center">
              <div>
                <p className="font-black uppercase tracking-widest text-slate-400 text-[10px] mb-1">Your Word</p>
                <h2 className="font-black text-[#4260FF] dark:text-[#B3C8F6] tracking-tighter italic uppercase text-4xl">{myGameData?.word}</h2>
              </div>
              <form onSubmit={handleNextTurn} className="space-y-4">
                <input autoFocus type="text" value={descInput} onChange={handleDescInputChange} placeholder="단어에 대해 설명해주세요" className="w-full p-5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-2xl outline-none font-black text-center text-xl text-slate-900 dark:text-white focus:border-[#4260FF] transition-all" />
                <button type="submit" className="w-full bg-[#4260FF] text-white py-5 rounded-2xl font-black text-xl hover:bg-[#4260FF]/90 shadow-xl shadow-[#4260FF]/20 uppercase italic transition-all">설명 완료 ({timeLeft}s)</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 라이어 정답 추리 모달 */}
      {gameStatus === "LIAR_GUESS" && isLiar && !isSpectator && !isMinimized && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#AF0D4E]/60 dark:bg-[#AF0D4E]/80 backdrop-blur-sm transition-colors">
          <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl border-4 border-[#AF0D4E] overflow-hidden w-full max-w-lg animate-in zoom-in-95 transition-colors">
            <div className="bg-[#AF0D4E] p-4 flex justify-between items-center transition-colors">
              <span className="text-white font-black italic uppercase tracking-tighter text-xl mx-auto">Guess Time!</span>
              <button onClick={() => setIsMinimized(true)} className="text-white/80 hover:text-white p-1 absolute right-6"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg></button>
            </div>
            <div className="p-8 flex flex-col gap-6 text-center">
              <div>
                <p className="text-[10px] text-[#FF59A9] font-black uppercase tracking-widest mb-1">당신은 라이어입니다</p>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter italic uppercase">시민의 단어를 맞히세요</h2>
              </div>
              <form onSubmit={handleSubmitGuess} className="space-y-4">
                <input autoFocus type="text" value={guessWord} onChange={handleGuessInputChange} placeholder="정답 입력..." className="w-full p-5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-2xl outline-none font-black text-center text-xl text-slate-900 dark:text-white focus:border-[#FF59A9] transition-all" />
                <button className="w-full bg-[#FF59A9] hover:bg-[#FF59A9]/90 text-white py-5 rounded-2xl font-black text-xl shadow-xl shadow-[#FF59A9]/20 uppercase italic transition-all">정답 제출 ({timeLeft}s)</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 모바일 헤더 */}
      <div className="md:hidden bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm p-3 flex justify-between items-center border-b border-slate-200 dark:border-slate-700 shrink-0 z-40 transition-colors">
        <span className="font-black italic text-slate-800 dark:text-slate-100 tracking-tighter">🕵️ {roomId.toUpperCase()}</span>
        <div className="flex items-center gap-1.5">
          {/* 🌟 다크모드 버튼 (모바일용) */}
          <button onClick={() => setIsDarkMode(prev => !prev)} className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 p-1.5 rounded-full shadow-sm active:scale-95 transition-colors text-xs w-7 h-7 flex items-center justify-center">
            {isDarkMode ? '🌙' : '☀️'}
          </button>
          <button onClick={() => setIsInfoVisible(!isInfoVisible)} className="bg-slate-800 dark:bg-slate-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform">{isInfoVisible ? "HIDE INFO" : "SHOW INFO"}</button>
          <button onClick={handleExit} className="bg-[#AF0D4E]/10 text-[#AF0D4E] dark:text-[#FF59A9] border-2 border-[#AF0D4E]/30 px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm active:scale-95 transition-all duration-300 hover:bg-[#AF0D4E] hover:text-white">EXIT ROOM</button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 p-2 md:p-4 gap-2 md:gap-4 overflow-hidden relative">
        {isMinimized && (isMyTurn || (gameStatus === "LIAR_GUESS" && isLiar)) && (
          <div className="md:hidden fixed bottom-[80px] left-2 right-2 z-[55] animate-in slide-in-from-bottom-2">
            <button onClick={() => setIsMinimized(false)} className="w-full bg-slate-900 dark:bg-slate-800 text-white p-4 rounded-2xl shadow-xl border-2 border-white/20 dark:border-slate-600 flex items-center justify-between font-black italic uppercase">
              <div className="flex items-center gap-2">
                <span className="bg-[#4260FF] px-2 py-1 rounded text-[10px]">RECOVERY</span>
                <span className="text-sm">입력창 열기</span>
              </div>
              <div className="bg-[#FF59A9] text-white px-3 py-1 rounded-lg text-lg tabular-nums">{timeLeft}s</div>
            </button>
          </div>
        )}

        {/* 좌측 패널 */}
        <div className={` ${isInfoVisible ? 'flex' : 'hidden'} md:flex w-full md:w-1/3 flex-col gap-2 md:gap-4 overflow-hidden h-full shrink-0 max-h-[50vh] md:max-h-full transition-all duration-300`}>
          
          <div className="bg-white dark:bg-slate-800 p-3 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-700 shrink-0 flex items-center gap-3 md:gap-4 transition-colors">
            <div className="w-10 h-10 md:w-16 md:h-16 bg-[#B3C8F6]/30 dark:bg-[#4260FF]/20 rounded-full flex items-center justify-center shrink-0 border-2 md:border-4 border-white dark:border-slate-800 text-lg md:text-2xl transition-colors">👤</div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-black text-base md:text-xl text-slate-900 dark:text-white leading-none truncate max-w-[100px]">{name}</span>
                <span className="bg-[#4260FF] text-white text-[8px] md:text-[10px] px-1.5 py-0.5 rounded-full font-black uppercase">Me</span>
                {isSpectator && <span className="text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter shrink-0 border bg-[#BFB8E8]/20 border-[#BFB8E8] text-[#9489D5] dark:text-[#BFB8E8] ml-1">Spectator</span>}
              </div>
              <span className="text-slate-400 dark:text-slate-400 text-[9px] md:text-xs font-bold mt-1 uppercase">SCORE: <span className="text-[#4260FF] dark:text-[#B3C8F6]">{myInfo?.score || 0}</span> | {myInfo?.isHost ? "HOST 👑" : "MEMBER"}</span>
            </div>
            {isTimerActive && <div className={`ml-auto px-4 py-2 rounded-2xl border-2 font-black text-xl transition-colors ${timeLeft <= 5 ? 'bg-[#FF59A9]/10 border-[#FF59A9] text-[#FF59A9] animate-pulse' : 'bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>{timeLeft}s</div>}
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-700 flex-1 flex flex-col overflow-hidden transition-colors">
            <h2 className="text-base md:text-xl font-black mb-2 md:mb-4 border-b border-slate-100 dark:border-slate-700 pb-2 flex justify-between items-center shrink-0 uppercase italic text-slate-400 dark:text-slate-500 transition-colors">
              {gameStatus === "LOBBY" ? "🏠 Lobby" : gameStatus === "VOTING" ? "🗳 Voting" : gameStatus === "LIAR_GUESS" ? "🤔 Liar's Turn" : gameStatus === "RESULT" ? "🏆 Result" : "🎮 Playing"}
            </h2>
            <div className="flex-1 flex flex-col overflow-hidden">
              {(gameStatus === "PLAYING" || gameStatus === "VOTING" || gameStatus === "LIAR_GUESS") && myGameData && (
                <div className="mb-3 p-4 bg-[#4260FF] rounded-[1.5rem] text-center shadow-lg shadow-[#4260FF]/30 dark:shadow-none shrink-0 transition-colors">
                  <p className="text-[8px] text-[#B3C8F6] font-black mb-0.5 uppercase tracking-widest">Category: {myGameData.category}</p>
                  <p className="text-2xl font-black text-white tracking-tighter italic uppercase">{myGameData.word}</p>
                </div>
              )}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {players.map((p) => (
                  <div key={p.id} className={`p-3 md:p-4 rounded-2xl flex justify-between items-center border-2 transition-all ${currentTurnId === p.id ? "bg-[#FFAC00]/10 dark:bg-[#FFAC00]/20 border-[#FFAC00] shadow-md" : "bg-white dark:bg-slate-800 border-slate-50 dark:border-slate-700"} ${socket.id === p.id ? "ring-2 ring-[#4260FF]/20" : ""}`}>
                    <div className="flex items-center gap-2 truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        {p.isHost && <span className="text-xs">👑</span>}
                        <span className={`font-black text-xs md:text-sm truncate ${socket.id === p.id ? "text-[#4260FF] dark:text-[#B3C8F6]" : "text-slate-700 dark:text-slate-200"}`}>{p.name}</span>
                      </div>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-300 transition-colors">{p.score || 0}P</span>
                      {currentTurnId === p.id && gameStatus === "PLAYING" && <span className="text-[8px] bg-[#FFAC00] text-white px-1.5 py-0.5 rounded-full font-black animate-pulse uppercase shrink-0">Turn</span>}
                      {((gameStatus === "LOBBY" || gameStatus === "RESULT") && !p.isHost) ? (
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter shrink-0 border transition-colors ${p.isReady ? "bg-[#9489D5]/10 border-[#9489D5]/50 text-[#9489D5]" : "bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-400"}`}>{p.isReady ? "Ready" : "Wait"}</span>
                      ) : p.userType === "SPECTATOR" && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-md uppercase border bg-[#BFB8E8]/20 border-[#BFB8E8] text-[#9489D5] dark:text-[#BFB8E8] transition-colors">Spectator</span>
                      )}
                    </div>
                    {gameStatus === "VOTING" && !hasVoted && !isSpectator && p.id !== socket.id && p.userType === 'PLAYER' && (
                      <button onClick={() => handleVote(p.id)} className="bg-[#FF59A9] text-white text-[10px] px-3 py-1.5 rounded-xl font-black hover:bg-[#AF0D4E] transition-colors uppercase italic shadow-sm">VOTE</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {(gameStatus === "LOBBY" || gameStatus === "RESULT") && roomSettings.allCategories.length > 0 && (
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 w-full mb-3 text-left z-10 relative transition-colors">
              <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-3 flex items-center justify-between">카테고리 설정 <span className={`text-xs px-2 py-1 rounded-full transition-colors ${amIHost ? 'bg-[#B3C8F6]/30 text-[#4260FF] dark:text-[#B3C8F6]' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>{amIHost ? '방장 권한' : '방장만 변경 가능'}</span></h3>
              <div className="flex flex-wrap gap-2">
                {roomSettings.allCategories.map(cat => (
                  <label key={cat} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${!amIHost ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700'} ${roomSettings.selectedCategories.includes(cat) ? 'border-[#4260FF] text-[#4260FF] dark:text-[#B3C8F6] bg-[#B3C8F6]/20' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>
                    <input type="checkbox" className="w-4 h-4 text-[#4260FF] rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700 focus:ring-[#4260FF] categoryCheckboxes" checked={roomSettings.selectedCategories.includes(cat)} disabled={!amIHost} onChange={(e) => socket.emit('toggle-category', roomId, cat, e.target.checked)} /> {cat}
                  </label>
                ))}
              </div>
              {amIHost && (
                <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 transition-colors">
                  <button onClick={() => { roomSettings.allCategories.forEach(cat => { if (!roomSettings.selectedCategories.includes(cat)) socket.emit('toggle-category', roomId, cat, true); }); }} className="px-3 py-1.5 text-xs font-semibold text-[#4260FF] dark:text-[#B3C8F6] bg-white dark:bg-slate-800 border border-[#B3C8F6]/50 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">모두 선택</button>
                  <button onClick={() => { roomSettings.selectedCategories.forEach(cat => { socket.emit('toggle-category', roomId, cat, false); }); }} className="px-3 py-1.5 text-xs font-semibold text-[#FF59A9] bg-white dark:bg-slate-800 border border-[#FF59A9]/30 rounded-lg hover:bg-rose-50 dark:hover:bg-slate-700 transition-colors shadow-sm">모두 해제</button>
                </div>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 p-3 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-sm shrink-0 transition-colors">
            {isMinimized && (isMyTurn || (gameStatus === "LIAR_GUESS" && isLiar)) ? (
              <button onClick={() => setIsMinimized(false)} className="hidden md:flex w-full bg-slate-900 dark:bg-slate-700 text-white p-4 rounded-2xl shadow-lg border-2 border-slate-700 dark:border-slate-600 flex items-center justify-between font-black italic uppercase hover:bg-slate-800 dark:hover:bg-slate-600 transition-all group">
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[10px] text-[#B3C8F6] mb-1 group-hover:animate-pulse">MINIMIZED</span>
                  <span className="text-sm">열어서 입력하기</span>
                </div>
                <div className="bg-[#FF59A9] text-white w-12 h-12 rounded-xl flex items-center justify-center text-xl tabular-nums shadow-inner">{timeLeft}</div>
              </button>
            ) : gameStatus === "LOBBY" || gameStatus === "RESULT" ? (
              myInfo?.isHost ? (
                <button onClick={handleStartGame} className="w-full bg-[#4260FF] text-white py-4 rounded-2xl font-black text-lg hover:bg-[#4260FF]/90 shadow-lg shadow-[#4260FF]/20 uppercase italic transition-all">{gameStatus === "RESULT" ? "다시 시작" : "Start Game"}</button>
              ) : (
                <button onClick={handleToggleReady} className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${myInfo?.isReady ? "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400" : "bg-[#9489D5] text-white hover:bg-[#9489D5]/90 shadow-lg shadow-[#9489D5]/20"}`}>{myInfo?.isReady ? "준비완료" : "준비"}</button>
              )
            ) : (
              <div className="text-center py-2 text-[10px] font-black text-slate-300 dark:text-slate-500 uppercase tracking-widest italic animate-pulse">{gameStatus} in progress</div>
            )}
          </div>
        </div>

        {/* 우측 채팅 패널 */}
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden h-full min-h-0 transition-colors">
          <div className="p-4 border-b border-slate-50 dark:border-slate-700 bg-slate-50/20 dark:bg-slate-800 flex justify-between items-center shrink-0 transition-colors">
            <h3 className="font-black text-slate-800 dark:text-slate-200 italic uppercase text-xs flex items-center gap-2">
              <span className="w-2 h-2 bg-[#9489D5] rounded-full animate-pulse"></span> {roomId.toUpperCase()} CHAT
            </h3>
            {/* 🌟 다크모드 버튼 + Exit 버튼 그룹 (PC용) */}
            <div className="hidden md:flex items-center gap-2">
              <button onClick={() => setIsDarkMode(prev => !prev)} className="bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 p-1.5 rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-all w-8 h-8 flex items-center justify-center text-sm" title="다크모드 토글">
                {isDarkMode ? '🌙' : '☀️'}
              </button>
              <button onClick={handleExit} className="text-[10px] font-black px-4 py-2 rounded-xl uppercase border-2 border-[#AF0D4E]/20 bg-white dark:bg-slate-800 text-[#AF0D4E] dark:text-[#FF59A9] hover:bg-[#AF0D4E] hover:text-white transition-all duration-300">Exit Room</button>
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
            {chatLog.map((chat, idx) => (
              <div key={idx} className={`flex flex-col ${chat.author === name ? "items-end" : chat.author === 'SYSTEM_DESC' ? "items-center" : "items-start"}`}>
                {chat.author !== 'SYSTEM_DESC' && (
                  <span className={`text-[9px] font-black mb-1 px-2 uppercase tracking-tighter ${chat.author === 'SYSTEM' ? 'text-[#9489D5]' : 'text-slate-400 dark:text-slate-500'}`}>{chat.author === name ? "Me" : chat.author}</span>
                )}
                <div className={`px-5 py-3 rounded-[1.5rem] max-w-[85%] break-all shadow-sm font-bold text-sm transition-colors ${
                  chat.author === 'SYSTEM' ? "bg-[#9489D5] text-white mx-auto text-center rounded-2xl text-[10px] py-1.5 uppercase" :
                  chat.author === 'SYSTEM_DESC' ? "bg-[#4260FF] text-white rounded-[1.5rem] w-full text-center py-6 font-black italic text-xl shadow-xl shadow-[#4260FF]/20 animate-in slide-in-from-bottom-2" :
                  chat.author === name ? "bg-[#4260FF] text-white rounded-tr-none shadow-[#4260FF]/10" : 
                  "bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-600 rounded-tl-none"
                }`}>
                  {chat.message}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex gap-2 transition-colors">
            <input className="flex-1 p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl outline-none font-black text-slate-700 dark:text-slate-200 border-2 border-transparent focus:border-[#4260FF] dark:focus:border-[#B3C8F6] transition-all text-sm" placeholder="메시지 입력..." value={message} onChange={(e) => setMessage(e.target.value)} />
            <button className="bg-[#4260FF] text-white px-8 rounded-2xl font-black uppercase italic shadow-lg shadow-[#4260FF]/20 hover:bg-[#4260FF]/90 transition-colors">Send</button>
          </form>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; }
      `}</style>
    </div>
  );
}

export default App;