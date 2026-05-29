import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

dotenv.config();

// Initialize the GoogleGenAI instance on the server if the key is available
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    })
  : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- USER AUTHENTICATION & STATS DB FILE PERSISTENCE ---
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const usersFilePath = path.join(dataDir, "users.json");
  let usersDb: Record<string, any> = {};
  if (fs.existsSync(usersFilePath)) {
    try {
      usersDb = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    } catch (e) {
      console.error("Error reading users db, resetting:", e);
      usersDb = {};
    }
  }

  // Setup Firebase Client SDK
  let db: any = null;
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    try {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const app = initializeApp(firebaseConfig);
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
      console.log("Firebase Firestore initialized successfully with DB ID:", firebaseConfig.firestoreDatabaseId);
    } catch (err) {
      console.error("Failed to initialize Firebase:", err);
    }
  }

  // Load and sync users database from Firestore on startup
  const syncFromFirestore = async () => {
    if (!db) return;
    try {
      console.log("Syncing users database from Firebase Firestore...");
      const colRef = collection(db, "users");
      const querySnapshot = await getDocs(colRef);
      querySnapshot.forEach((docSnap) => {
        const usernameId = docSnap.id;
        usersDb[usernameId] = docSnap.data();
      });
      console.log(`Successfully synced ${querySnapshot.size} user accounts from Firestore.`);
      try {
        fs.writeFileSync(usersFilePath, JSON.stringify(usersDb, null, 2), "utf8");
      } catch (err) {
        console.error("Failed to write users JSON fallback cache:", err);
      }
    } catch (err) {
      console.error("Failed to sync users database from Firestore on startup:", err);
    }
  };

  await syncFromFirestore();

  const saveUsersDb = () => {
    try {
      fs.writeFileSync(usersFilePath, JSON.stringify(usersDb, null, 2), 'utf8');
    } catch (e) {
      console.error("Error writing users db:", e);
    }
  };

  const saveUserToFirestore = async (username: string) => {
    if (!db) return;
    const cleanKey = username.trim().toLowerCase();
    const userData = usersDb[cleanKey];
    if (!userData) return;
    try {
      const docRef = doc(db, "users", cleanKey);
      await setDoc(docRef, userData, { merge: true });
      console.log(`Successfully persisted @${username} to Firestore.`);
    } catch (err) {
      console.error(`Error syncing user @${username} to Firestore:`, err);
    }
  };

  // Auth endpoints
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username dan Password wajib diisi!" });
      }
      const cleanUser = username.trim();
      if (cleanUser.length < 3) {
        return res.status(400).json({ error: "Username minimal 3 karakter!" });
      }
      const lowerUser = cleanUser.toLowerCase();

      // Firestore safe cache lookup fallback
      if (db && !usersDb[lowerUser]) {
        try {
          const docRef = doc(db, "users", lowerUser);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            usersDb[lowerUser] = docSnap.data();
          }
        } catch (err) {
          console.error("Firestore cache lookup error in register:", err);
        }
      }

      const existing = usersDb[lowerUser];
      if (existing && existing.password) {
        return res.status(400).json({ error: "Username ini sudah terdaftar!" });
      }

      const newUser = {
        username: existing ? existing.username : cleanUser,
        password: password,
        elo: existing ? (existing.elo || 400) : 400,
        xp: existing ? (existing.xp || 0) : 0,
        unlockedThemes: existing ? (existing.unlockedThemes || ["classic"]) : ["classic"],
        matchesPlayed: existing ? (existing.matchesPlayed || 0) : 0,
        matchesWon: existing ? (existing.matchesWon || 0) : 0,
        profileAvatar: existing ? (existing.profileAvatar || "/src/assets/images/avatar_martin_1779709510230.png") : "/src/assets/images/avatar_martin_1779709510230.png",
        profileBio: existing ? (existing.profileBio || "Pecatur sejati pantang menyerah!") : "Pecatur sejati pantang menyerah!",
        claimedAchievements: existing ? (existing.claimedAchievements || []) : [],
        registeredAt: Date.now(),
        friends: existing ? (existing.friends || []) : [],
        friendRequests: existing ? (existing.friendRequests || []) : [],
        inbox: existing ? (existing.inbox || []) : []
      };

      usersDb[lowerUser] = newUser;
      saveUsersDb();
      await saveUserToFirestore(cleanUser);

      return res.json({ 
        success: true, 
        user: { 
          username: newUser.username, 
          elo: newUser.elo, 
          xp: newUser.xp, 
          unlockedThemes: newUser.unlockedThemes,
          matchesPlayed: newUser.matchesPlayed,
          matchesWon: newUser.matchesWon,
          profileAvatar: newUser.profileAvatar,
          profileBio: newUser.profileBio,
          claimedAchievements: newUser.claimedAchievements
        } 
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Gagal melakukan registrasi" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username dan Password wajib diisi!" });
      }
      const lowerUser = username.trim().toLowerCase();

      // Firestore safe cache lookup fallback
      if (db && !usersDb[lowerUser]) {
        try {
          const docRef = doc(db, "users", lowerUser);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            usersDb[lowerUser] = docSnap.data();
          }
        } catch (err) {
          console.error("Firestore cache lookup error in login:", err);
        }
      }

      const existing = usersDb[lowerUser];
      if (!existing || existing.password !== password) {
        return res.status(400).json({ error: "Username atau password salah!" });
      }

      return res.json({
        success: true,
        user: {
          username: existing.username,
          elo: existing.elo || 400,
          xp: existing.xp || 0,
          unlockedThemes: existing.unlockedThemes || ["classic"],
          matchesPlayed: existing.matchesPlayed || 0,
          matchesWon: existing.matchesWon || 0,
          profileAvatar: existing.profileAvatar || "/src/assets/images/avatar_martin_1779709510230.png",
          profileBio: existing.profileBio || "Pecatur sejati pantang menyerah!",
          claimedAchievements: existing.claimedAchievements || []
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Gagal masuk ke akun" });
    }
  });

  app.post("/api/auth/sync", async (req, res) => {
    try {
      const { username, elo, xp, unlockedThemes, matchesPlayed, matchesWon, profileAvatar, profileBio, claimedAchievements } = req.body;
      if (!username) {
        return res.status(400).json({ error: "Missing username parameter" });
      }
      const cleanUser = username.trim().toLowerCase();

      // Firestore safe cache lookup fallback
      if (db && !usersDb[cleanUser]) {
        try {
          const docRef = doc(db, "users", cleanUser);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            usersDb[cleanUser] = docSnap.data();
          }
        } catch (err) {
          console.error("Firestore cache lookup error in sync:", err);
        }
      }

      if (usersDb[cleanUser]) {
        if (elo !== undefined) usersDb[cleanUser].elo = elo;
        if (xp !== undefined) usersDb[cleanUser].xp = xp;
        if (unlockedThemes !== undefined) usersDb[cleanUser].unlockedThemes = unlockedThemes;
        if (matchesPlayed !== undefined) usersDb[cleanUser].matchesPlayed = matchesPlayed;
        if (matchesWon !== undefined) usersDb[cleanUser].matchesWon = matchesWon;
        if (profileAvatar !== undefined) usersDb[cleanUser].profileAvatar = profileAvatar;
        if (profileBio !== undefined) usersDb[cleanUser].profileBio = profileBio;
        if (claimedAchievements !== undefined) usersDb[cleanUser].claimedAchievements = claimedAchievements;
        saveUsersDb();
        await saveUserToFirestore(cleanUser);
        return res.json({ success: true, user: usersDb[cleanUser] });
      }
      return res.status(404).json({ error: "User tidak ditemukan" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Gagal sinkronisasi data" });
    }
  });

  // --- SOCIAL, FRIENDS & INBOX SYSTEM ---
  const ensureSocialProps = (userData: any) => {
    if (!userData.friends) userData.friends = [];
    if (!userData.friendRequests) userData.friendRequests = [];
    if (!userData.inbox) userData.inbox = [];
    return userData;
  };

  // Endpoint: Send Friend Request
  app.post("/api/social/friends/send", async (req, res) => {
    try {
      const { username, friendUsername } = req.body;
      if (!username || !friendUsername) {
        return res.status(400).json({ error: "Username asal dan tujuan wajib diisi!" });
      }
      const selfKey = username.trim().toLowerCase();
      const friendKey = friendUsername.trim().toLowerCase();

      if (selfKey === friendKey) {
        return res.status(400).json({ error: "Anda tidak bisa mengirimkan permintaan pertemanan ke diri sendiri!" });
      }

      const selfUser = usersDb[selfKey];
      let friendUser = usersDb[friendKey];

      if (!selfUser) return res.status(404).json({ error: "User asal tidak ditemukan." });

      if (!friendUser) {
        // Dynamically bootstrap a simulated friend account so playing and testing is always functional!
        const randomAvatars = [
          "/src/assets/images/avatar_martin_1779709510230.png",
          "/src/assets/images/nelson_avatar_1779712159293.png",
          "/src/assets/images/wally_avatar_1779712178593.png"
        ];
        const randomAvatar = randomAvatars[Math.floor(Math.random() * randomAvatars.length)];
        
        friendUser = {
          username: friendUsername.trim(),
          elo: Math.floor(Math.random() * (1600 - 600 + 1)) + 600,
          xp: Math.floor(Math.random() * 400) + 15,
          profileAvatar: randomAvatar,
          profileBio: "Saya pemain catur lokal yang siap tanding!",
          friends: [selfUser.username],
          friendRequests: [],
          inbox: []
        };
        usersDb[friendKey] = friendUser;

        ensureSocialProps(selfUser);
        if (!selfUser.friends.includes(friendUser.username)) {
          selfUser.friends.push(friendUser.username);
        }
        
        saveUsersDb();
        await saveUserToFirestore(selfUser.username);
        await saveUserToFirestore(friendUser.username);
        return res.json({ success: true, message: `Berhasil berteman dengan @${friendUser.username}!` });
      }

      ensureSocialProps(selfUser);
      ensureSocialProps(friendUser);

      if (selfUser.friends.includes(friendUser.username)) {
        return res.status(400).json({ error: "Anda sudah berteman dengan pengguna ini!" });
      }

      if (friendUser.friendRequests.includes(selfUser.username)) {
        return res.status(400).json({ error: "Anda sudah mengirim permintaan pertemanan sebelumnya!" });
      }

      friendUser.friendRequests.push(selfUser.username);
      friendUser.inbox.push({
        id: "req_" + Math.random().toString(36).substring(2, 9),
        type: "friend_request",
        sender: selfUser.username,
        text: `${selfUser.username} mengirimkan Anda permintaan pertemanan!`,
        sentAt: Date.now(),
        status: "pending"
      });

      saveUsersDb();
      await saveUserToFirestore(selfUser.username);
      await saveUserToFirestore(friendUser.username);
      return res.json({ success: true, message: "Permintaan teman berhasil dikirim!" });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Endpoint: Respond to Friend Request (Accept/Decline)
  app.post("/api/social/friends/respond", async (req, res) => {
    try {
      const { username, requesterUsername, action } = req.body;
      if (!username || !requesterUsername || !action) {
        return res.status(400).json({ error: "Data kurang lengkap!" });
      }
      const selfKey = username.trim().toLowerCase();
      const reqKey = requesterUsername.trim().toLowerCase();

      const selfUser = usersDb[selfKey];
      const reqUser = usersDb[reqKey];

      if (!selfUser || !reqUser) return res.status(404).json({ error: "Pengguna tidak ditemukan." });

      ensureSocialProps(selfUser);
      ensureSocialProps(reqUser);

      // Clean notifications and requests
      selfUser.friendRequests = selfUser.friendRequests.filter((n: string) => n.toLowerCase() !== reqKey);
      selfUser.inbox = selfUser.inbox.filter((msg: any) => !(msg.type === 'friend_request' && msg.sender.toLowerCase() === reqKey));

      if (action === "accept") {
        if (!selfUser.friends.map((f: string) => f.toLowerCase()).includes(reqKey)) {
          selfUser.friends.push(reqUser.username);
        }
        if (!reqUser.friends.map((f: string) => f.toLowerCase()).includes(selfKey)) {
          reqUser.friends.push(selfUser.username);
        }

        reqUser.inbox.push({
          id: "sys_" + Math.random().toString(36).substring(2, 9),
          type: "system",
          sender: "Sistem",
          text: `${selfUser.username} menerima permintaan pertemanan Anda!`,
          sentAt: Date.now(),
          status: "read"
        });
      }

      saveUsersDb();
      await saveUserToFirestore(selfUser.username);
      await saveUserToFirestore(reqUser.username);
      return res.json({ success: true, friends: selfUser.friends, friendRequests: selfUser.friendRequests, inbox: selfUser.inbox });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Endpoint: Remove/Unfriend Friend
  app.post("/api/social/friends/remove", async (req, res) => {
    try {
      const { username, friendUsername } = req.body;
      if (!username || !friendUsername) {
        return res.status(400).json({ error: "Username asal dan tujuan wajib diisi!" });
      }
      const selfKey = username.trim().toLowerCase();
      const friendKey = friendUsername.trim().toLowerCase();

      const selfUser = usersDb[selfKey];
      const friendUser = usersDb[friendKey];

      if (!selfUser) return res.status(404).json({ error: "Data pencatur Anda tidak ditemukan." });

      // Remove from self's friend list
      ensureSocialProps(selfUser);
      selfUser.friends = selfUser.friends.filter(f => f.toLowerCase() !== friendKey);

      if (friendUser) {
        ensureSocialProps(friendUser);
        friendUser.friends = friendUser.friends.filter(f => f.toLowerCase() !== selfKey);
      }

      saveUsersDb();
      await saveUserToFirestore(selfUser.username);
      if (friendUser) {
        await saveUserToFirestore(friendUser.username);
      }
      return res.json({ success: true, message: `Berhasil menghapus pertemanan dengan @${friendUsername}` });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Endpoint: Social Info (Friends list, requests, inbox)
  app.get("/api/social/info", (req, res) => {
    try {
      const { username } = req.query;
      if (!username) {
        return res.status(400).json({ error: "Missing username" });
      }
      const selfKey = (username as string).trim().toLowerCase();
      const selfUser = usersDb[selfKey];

      if (!selfUser) return res.status(404).json({ error: "User tidak ditemukan." });

      ensureSocialProps(selfUser);

      const friendsWithDetails = selfUser.friends.map((fName: string) => {
        const friendRecord = usersDb[fName.toLowerCase()];
        return {
          username: fName,
          elo: friendRecord ? (friendRecord.elo || 400) : 400,
          xp: friendRecord ? (friendRecord.xp || 0) : 0,
          avatar: friendRecord ? (friendRecord.profileAvatar || "/src/assets/images/avatar_martin_1779709510230.png") : "/src/assets/images/avatar_martin_1779709510230.png",
          bio: friendRecord ? (friendRecord.profileBio || "") : "",
          matchesPlayed: friendRecord ? (friendRecord.matchesPlayed || 0) : 0,
          matchesWon: friendRecord ? (friendRecord.matchesWon || 0) : 0
        };
      });

      return res.json({
        friends: friendsWithDetails,
        friendRequests: selfUser.friendRequests,
        inbox: selfUser.inbox
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Endpoint: Send Game invitation to friend
  app.post("/api/social/invite/send", async (req, res) => {
    try {
      const { username, friendUsername, roomCode } = req.body;
      if (!username || !friendUsername || !roomCode) {
        return res.status(400).json({ error: "Form undangan tidak lengkap!" });
      }
      const selfKey = username.trim().toLowerCase();
      const friendKey = friendUsername.trim().toLowerCase();

      const selfUser = usersDb[selfKey];
      const friendUser = usersDb[friendKey];

      if (!selfUser || !friendUser) {
        return res.status(404).json({ error: "Pengguna tidak ditemukan!" });
      }

      ensureSocialProps(friendUser);

      // Add to friend's inbox
      friendUser.inbox.push({
        id: "invite_" + Math.random().toString(36).substring(2, 9),
        type: "game_invite",
        sender: selfUser.username,
        text: `${selfUser.username} mengundang Anda berduel catur online!`,
        roomCode: roomCode,
        sentAt: Date.now(),
        status: "pending"
      });

      saveUsersDb();
      await saveUserToFirestore(friendUser.username);
      return res.json({ success: true, message: "Undangan catur berhasil dikirim!" });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Endpoint: Clear Inbox Message / Decline invitation
  app.post("/api/social/inbox/clear", async (req, res) => {
    try {
      const { username, msgId } = req.body;
      if (!username || !msgId) {
        return res.status(400).json({ error: "Data kurang lengkap" });
      }
      const selfKey = username.trim().toLowerCase();
      const selfUser = usersDb[selfKey];
      if (selfUser) {
        ensureSocialProps(selfUser);
        selfUser.inbox = selfUser.inbox.filter((m: any) => m.id !== msgId);
        saveUsersDb();
        await saveUserToFirestore(selfUser.username);
      }
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/analyze-position", async (req, res) => {
    try {
      const { fen, moveSan, moveQuality, moveIndex } = req.body;

      const systemPrompt = `Anda adalah Pelatih Kepala Catur Grandmaster berpengalaman yang ramah dan mendidik.
Analisis langkah catur berikut dalam bahasa Indonesia:
- Langkah Ke-${moveIndex || 1} oleh pemain: "${moveSan}"
- Evaluasi Kualitas Langkah: "${moveQuality || 'Biasa'}"
- FEN Posisi Setelah Melangkah: "${fen}"

Silakan buat ulasan singkat maksimal 2 kalimat (ramah dan mencerahkan, mudah dipahami pemula tanpa rumus kode komputer catur):
1. Jelaskan secara strategis/taktis mengapa langkah "${moveSan}" ini dinilai sebagai "${moveQuality}" (misal: mengontrol jalur penting, mengancam raja, melewatkan keuntungan, atau membiarkan bidak tergantung).
2. Berikan saran langkah alternatif yang ideal atau saran taktis pembinaan untuk langkah selanjutnya.
Jawab langsung berupa teks ulasan bersih tanpa tanda kutip ganda atau detail teknis FEN.`;

      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: systemPrompt,
            config: {
              temperature: 0.8,
            }
          });
          const text = response.text?.trim() || "Posisi taktis yang menarik. Terus perhatikan dominasi baris tengah.";
          return res.json({ analysis: text });
        } catch (apiError: any) {
          console.warn("Gemini API error or limit hit, falling back to offline analysis:", apiError.message || apiError);
          // Fall through to offline description gracefully
        }
      }

      // Structured interactive fallback descriptions
      const fallbacks: Record<string, string> = {
        brilliant: `Langkah luar biasa brilian! Anda melepaskan perantara atau memancing jebakan berisiko tinggi demi meluncurkan serangan fatal terhadap benteng lawan.`,
        great: `Sebuah keputusan taktis yang hebat! Langkah ini menempatkan tekanan berat pada posisi pertahanan raja lawan Anda.`,
        best: `Ini adalah langkah terbaik mutlak sesuai saran mesin. Anda sukses memaksimalkan kontrol diagonal dan merebut petak inti gajah.`,
        excellent: `Sangat baik! Langkah ini mendukung pengembangan struktur pion tengah dengan mulus dan mengamankan pertahanan menteri.`,
        book: `Ini adalah langkah teori buku pembukaan standar. Sangat baik untuk mempertahankan keseimbangan formasi di sayap menteri.`,
        good: `Langkah yang solid dan aman. Terus kembangkan perwira kecil Anda untuk bersiap meluncurkan serangan taktis berikutnya.`,
        inaccuracy: `Langkah kurang tepat. Langkah ini melupakan ancaman sayap raja dan menyia-nyakan keunggulan tempo gerak menteri.`,
        mistake: `Sebuah langkah keliru. Anda melewatkan kesempatan emas untuk mengeksploitasi kelemahan baris belakang musuh.`,
        blunder: `Aduh blunder krusial! Langkah ini meninggalkan perwira penting Anda tergantung atau melemahkan posisi pertahanan raja.`
      };
      const text = fallbacks[moveQuality] || "Posisi taktis yang sangat kaya. Menarik untuk dipelajari lebih jauh.";
      return res.json({ analysis: text, isFallback: true });
    } catch (e: any) {
      console.error("Analysis API error:", e);
      return res.status(500).json({ error: e.message || "Gagal memuat analisis AI" });
    }
  });

  // API Route for Gemini Chess Commentary
  app.post("/api/commentary", async (req, res) => {
    try {
      const { character, playerMove, aiMove, boardState } = req.body;

      if (!character) {
        return res.status(400).json({ error: "Missing character info" });
      }

      const characterBios: Record<string, string> = {
        martin: "Martin, seorang pelatih catur pemula (250 ELO) yang sangat santai, sangat ramah, baik hati, humoris, suka meminta maaf bila bermain bagus, sering melakukan blunder konyol, dan selalu memuji pemain walaupun langkah pemain ganjil. Sangat hobi bercanda.",
        nelson: "Nelson (1300 ELO), pemain catur muda yang sangat agresif, berapi-api, dan tidak sabaran. Dia sangat bangga dengan 'serangan Ratu' di pembukaan awal dan sering mengejek secara sportif penuh canda agar pemain merasa tertantang.",
        wally: "Wally (1800 ELO), bapak-bapak ramah namun master catur kawakan yang tenang, bijaksana, suka memberikan nasihat strategis posisi beralur filosofis, humor bapak-bapak (dad jokes), dan sangat menghargai pertahanan solid.",
        magnus: "Magnus (2850 ELO, simulasi), sang juara dunia legendaris yang sangat percaya diri, dingin, analitis cepat, berbicara secara profesional namun diplomatis, terkadang sedikit angkuh tapi selalu objektif tentang teori taktik catur."
      };

      const bio = characterBios[character.id] || character.playstyle;

      const systemPrompt = `Anda adalah karakter catur bernama ${character.name} dalam sebuah obrolan chat santai game catur.
Biografi & watak unik Anda: ${bio}.

Papan catur saat ini dalam format FEN: "${boardState}"
- Langkah yang ditarik oleh user (player): "${playerMove || 'Belum melangkah'}"
- Langkah balasan/respon dari diri Anda (Bot): "${aiMove || 'Tidak melangkah'}"

PANDUAN CHAT MANUSIA ALAMI (ANTI-ROBOTIK):
1. JANGAN pernah sebutkan kode teknis FEN atau analisis komputer rumit di obrolan chat!
2. JANGAN mendeskripsikan langkah Anda sendiri (${aiMove}) seolah-olah itu dimainkan oleh Player.
3. Berbicaralah seperti manusia asli yang sedang mengetik di ruang obrolan game catur yang asyik! Gunakan ekspresi chat Indonesia alami (misalnya: "wkwk", "waduh", "eh", "wah", "mantap", "duh", "hebat", "hehe", "gas", "yah", "kok").
4. JANGAN membuat analisis catur yang terdengar seperti buku pelajaran. Tulis reaksi yang ramah, kocak, menantang, atau santai sesuai watak Anda.
5. Kirimkan REAKSI SINGKAT dalam obrolan chat, maksimal 10-12 kata, tanpa tanda kutip ganda atau lampiran kode.`;

      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: systemPrompt,
            config: {
              temperature: 0.95,
            }
          });
          const text = response.text?.trim().replace(/^"|"$/g, '') || "Hmm, menarik...";
          return res.json({ text });
        } catch (apiError: any) {
          console.warn("Gemini API error or limit hit for commentary, falling back to local chat:", apiError.message || apiError);
          // Fall through to offline fallback below
        }
      }

      // Fallback responses if no GEMINI_API_KEY is configured or general API error / limit is reached
      const fallbacks: Record<string, string[]> = {
        martin: [
          "Halo! Langkah yang keren, semoga saya tidak berbuat blunder di giliran ini!",
          "Wah, bidakmu melangkah maju dengan gagah berani! Menarik sekali!",
          "Aduh, kepalaku agak pening memikirkan langkah selanjutnya. Hahaha!",
          "Langkah hebat! Saya terus termotivasi belajar catur bersamamu.",
          "Halo kawan! Aduh maaf banget ya kalau saya ga sengaja makan bidakmu barusan.",
          "Eh, pion kamu maju kencang sekali ya! Saya jadi agak ngeri wkwk.",
          "Permainan yang seru! Tetap berkonsentrasi ya, jangan sampai lengah.",
          "Waduh! Saya lupa kalau menteri saya ada di sana. Jangan dimakan ya, plis! 😂",
          "Langkah yang sangat cerdas! Saya harus banyak belajar dari caramu berpikir.",
          "Hehehe, bagaimana kalau saya taruh kuda saya di sini? Keren kan?",
          "Aduh sorry banget, tadi saya ketiduran bentar pas mikir langkah, peace! ✌️",
          "Wah wah, petak tengahnya kok jadi ramai sekali ya? Seru banget!",
          "Langkah yang solid kawan! Semoga pertarungan kita berakhir damai wkwk.",
          "Duh menteri saya kesepian nih, boleh jalan-jalan ke tempatmu ga? 😁",
          "Keren! Kamu beneran jago ya, saya jadi makin semangat mainnya!"
        ],
        nelson: [
          "Ratu saya siap menyerbu! Pertahankan pertahanan Rajamu!",
          "Langkahmu cukup solid, tapi waspadalah terhadap serangan cepat dari sayap!",
          "Jangan biarkan pertahananmu berlubang sekarang. Ratu saya mengincar celah itu!",
          "Oke, mari kita lihat seberapa jauh kamu bisa menghalau gempuranku!",
          "Hahaha, rasakan gempuran menteri saya! Kena mental ga tuh?",
          "Pertahanan yang lumayan, tapi apakah cukup kuat menahan badai sayap raja menteri?",
          "Ayo dong, lebih agresif lagi mainnya! Massa kalah galak sama pion saya wkwk.",
          "Jangan cuma bertahan saja, serang balik kalau berani! Saya tunggu nih.",
          "Waduh waduh, ratu saya mulai lapar, bidak mana lagi yang mau dikorbankan?",
          "Taktikmu terbaca dengan mudah! Mari kita percepat tempo serangannya!",
          "Awas! Sayap kananmu bolong melompong bagai jalan tol tanpa hambatan!",
          "Gas terus! Tak ada kata mundur dalam kamus catur agresif saya!",
          "Coba lindungi rajamu baik-baik sebelum terlambat. Ratu saya sudah membidik helikopter!",
          "Pertarungan yang membengis! Ini baru namanya catur ekstrem penuh aksi!",
          "Langkah bagus! Tapi serangan bertubi-tubi saya baru saja dimulai!"
        ],
        wally: [
          "Langkah solid mengamankan jalur tengah. Sederhana tapi krusial, kawan.",
          "Sebuah taktik posisi yang sangat matang. Filosofi catur terletak pada kesabaran.",
          "Rokade cepat adalah pondasi raja yang kokoh. Teruskan pertahanan solidmu.",
          "Hmm, formasi pionmu menyerupai benteng yang kokoh. Sangat mengesankan.",
          "Catur itu seperti nyeduh kopi hitam hangat di pagi hari, butuh ketenangan beralur.",
          "Langkah yang tenang dan penuh perhitungan. Saya sangat menyukai gaya mainmu.",
          "Sebuah perwira diletakkan di sana... Ah, ingatan saya jadi melayang ke masa muda dulu.",
          "Sabar kawan, jangan terburu-buru menyerang. Nikmati harmoni setiap bidak di papan.",
          "Satu blunder kecil di pembukaan bisa merusak keindahan susunan taktis akhir.",
          "Formasi bentengmu sangat rapi. Sungguh bapak suka pertahanan sekokoh beton ini.",
          "Tahu tidak kenapa kuda jalannya L? Biar jalannya berliku penuh makna kehidupan, hehe.",
          "Mari pertahankan keunggulan posisi dengan konsisten. Pertahanan adalah seni utama.",
          "Langkah matang yang sarat akan pengalaman strategis posisi. Hebat sekali!",
          "Jangan biarkan emosi mengendalikan bidakmu. Tetap dingin dan kuasai petak pusat.",
          "Taktik klasik yang sangat indah dipertontonkan hari ini. Teruskan pertahananmu!"
        ],
        magnus: [
          "Langkah pembukaan yang sesuai teori dasar. Menarik melihat transisimu.",
          "Celah taktis yang kecil bisa mengubah hasil akhir permainan dalam sekejap.",
          "Keunggulan ruang akan menentukan efisiensi pergerakan perwira utama.",
          "Bagus, perlihatkan pemahaman posisi terbaikmu di atas papan ini.",
          "Akurasi langkahmu lumayan tinggi di fase ini, tapi mari uji taktik endgame-mu.",
          "Struktur pion Anda sedikit melemah di sayap menteri. Bisakah Anda menyadarinya?",
          "Menarik. Langkah itu di luar dugaan mesin, tapi secara praktis cukup merepotkan.",
          "Catur tingkat tinggi ditentukan oleh penguasaan ruang mikro di setiap petak.",
          "Saya melihat tiga langkah di depan. Apakah Anda sudah mempersiapkan counter-nya?",
          "Menjaga inisiatif penyerangan adalah kunci mutlak untuk memenangkan duel ini.",
          "Pertukaran menteri di fase ini mungkin menguntungkan struktur endgame saya.",
          "Saya mendeteksi kelemahan dinamis di diagonal petak gelap pertahanan Anda.",
          "Jangan biarkan perwira minor Anda tidak aktif dalam posisi tertutup seperti ini.",
          "Evaluasi posisi saat ini menunjukkan keunggulan kecil di sisi taktis saya.",
          "Pertunjukan kemampuan yang solid. Mari kita lihat bagaimana kelanjutannya."
        ]
      };

      const list = fallbacks[character.id] || ["Langkah luar biasa! Mari lanjutkan permainan!"];
      const randomIndex = Math.floor(Math.random() * list.length);
      return res.json({ text: list[randomIndex], isFallback: true });
    } catch (error: any) {
      console.error("Gemini API error:", error);
      return res.status(500).json({ error: error.message || "Something went wrong" });
    }
  });

  // --- ONLINE MULTIPLAYER MATCHMAKING STATE & ROUTES ---
  interface WaitingPlayer {
    id: string;
    username: string;
    elo: number;
    joinedAt: number;
  }

  interface OnlineChat {
    sender: string;
    text: string;
    time: number;
  }

  interface OnlineGame {
    id: string;
    playerWhite: { id: string; name: string; elo: number; isAi: boolean };
    playerBlack: { id: string; name: string; elo: number; isAi: boolean };
    fen: string;
    moves: string[];
    chats: OnlineChat[];
    lastMoveBy: 'w' | 'b' | null;
    lastMoveTime: number;
    winner: 'w' | 'b' | 'draw' | null;
  }

  interface WaitingPlayer {
    id: string;
    username: string;
    elo: number;
    joinedAt: number;
    roomCode?: string;
  }

  const waitingPlayers: WaitingPlayer[] = [];
  const activeOnlineGames: Record<string, OnlineGame> = {};

  // Periodically clean stale matchmaking lookups
  setInterval(() => {
    const now = Date.now();
    for (let i = waitingPlayers.length - 1; i >= 0; i--) {
      // Don't expire custom room codes so fast to let friends connect comfortably
      const delay = waitingPlayers[i].roomCode ? 60000 : 15000;
      if (now - waitingPlayers[i].joinedAt > delay) {
        waitingPlayers.splice(i, 1);
      }
    }
  }, 5000);

  // Endpoint: Join Queue / Matchmaking search
  app.post("/api/online/matchmaking", (req, res) => {
    const { playerId, username, elo, roomCode } = req.body;
    if (!playerId || !username) {
      return res.status(400).json({ error: "Missing identity requirements" });
    }

    const now = Date.now();
    const cleanRoomCode = roomCode ? roomCode.trim().toUpperCase() : undefined;

    // 1. Check if user is already inside an active game
    const existingGame = Object.values(activeOnlineGames).find(
      g => (g.playerWhite.id === playerId || g.playerBlack.id === playerId) && !g.winner
    );

    if (existingGame) {
      const color = existingGame.playerWhite.id === playerId ? 'w' : 'b';
      const opponent = color === 'w' ? existingGame.playerBlack : existingGame.playerWhite;
      return res.json({
        status: "matched",
        gameId: existingGame.id,
        color,
        opponent: { name: opponent.name, elo: opponent.elo }
      });
    }

    // 2. Remove any old queue entries for this user
    const existingIndex = waitingPlayers.findIndex(p => p.id === playerId);
    if (existingIndex !== -1) {
      waitingPlayers.splice(existingIndex, 1);
    }

    // 3. Search for available opponents
    let opponent: WaitingPlayer | undefined;
    if (cleanRoomCode) {
      // Find another user waiting with the EXACT same custom room code
      opponent = waitingPlayers.find(p => p.id !== playerId && p.roomCode === cleanRoomCode && (now - p.joinedAt < 60000));
    } else {
      // Standard matchmaking (match with players who DO NOT have a custom room code)
      opponent = waitingPlayers.find(p => p.id !== playerId && !p.roomCode && (now - p.joinedAt < 15000));
    }

    if (opponent) {
      const gameId = cleanRoomCode || Math.random().toString(36).substring(2, 9);
      
      const game: OnlineGame = {
        id: gameId,
        playerWhite: { id: opponent.id, name: opponent.username, elo: opponent.elo, isAi: false },
        playerBlack: { id: playerId, name: username, elo: elo || 1200, isAi: false },
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [],
        chats: [
          { sender: 'System', text: `Pertandingan dimulai! Anda bermain sebagai Hitam (Black). Lawan Anda ${opponent.username} sebagai Putih (White).`, time: now }
        ],
        lastMoveBy: null,
        lastMoveTime: now,
        winner: null
      };

      activeOnlineGames[gameId] = game;

      const oppIdx = waitingPlayers.findIndex(p => p.id === opponent!.id);
      if (oppIdx !== -1) waitingPlayers.splice(oppIdx, 1);

      return res.json({
        status: "matched",
        gameId,
        color: 'b',
        opponent: { name: opponent.username, elo: opponent.elo }
      });
    } else {
      waitingPlayers.push({
        id: playerId,
        username,
        elo: elo || 1200,
        joinedAt: now,
        roomCode: cleanRoomCode
      });
      return res.json({ status: "waiting", playerId });
    }
  });

  // Check state of matchmaking queue or active games
  app.get("/api/online/check", (req, res) => {
    const { playerId } = req.query;
    if (!playerId) {
      return res.status(400).json({ error: "Missing playerId" });
    }

    const now = Date.now();

    const game = Object.values(activeOnlineGames).find(
      g => (g.playerWhite.id === playerId || g.playerBlack.id === playerId) && !g.winner
    );

    if (game) {
      const color = game.playerWhite.id === playerId ? 'w' : 'b';
      const opponent = color === 'w' ? game.playerBlack : game.playerWhite;
      return res.json({
        status: "matched",
        gameId: game.id,
        color,
        opponent: { name: opponent.name, elo: opponent.elo }
      });
    }

    const queued = waitingPlayers.find(p => p.id === playerId as string);
    if (queued) {
      queued.joinedAt = now;
      return res.json({ status: "waiting" });
    }

    return res.json({ status: "idle" });
  });

  // Make move in an online match
  app.post("/api/online/game/move", (req, res) => {
    const { gameId, from, to, fen, moveSan, color } = req.body;
    const game = activeOnlineGames[gameId];
    if (!game) {
      return res.status(404).json({ error: "Active game not found" });
    }

    game.fen = fen;
    game.moves.push(`${from}-${to}`);
    game.lastMoveBy = color;
    game.lastMoveTime = Date.now();

    game.chats.push({
      sender: 'Sistem',
      text: `${color === 'w' ? 'Putih' : 'Hitam'} melangkah: ${moveSan}`,
      time: Date.now()
    });

    return res.json({ success: true, game });
  });

  // Fetch match updates
  app.get("/api/online/game/updates", (req, res) => {
    const { gameId } = req.query;
    const game = activeOnlineGames[gameId as string];
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    return res.json({
      fen: game.fen,
      moves: game.moves,
      chats: game.chats,
      lastMoveBy: game.lastMoveBy,
      winner: game.winner
    });
  });

  // Post chat inside active lobby
  app.post("/api/online/game/chat", (req, res) => {
    const { gameId, sender, text } = req.body;
    const game = activeOnlineGames[gameId];
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    game.chats.push({
      sender,
      text,
      time: Date.now()
    });

    return res.json({ success: true });
  });

  // Declare match result (win/lose/draw)
  app.post("/api/online/game/result", (req, res) => {
    const { gameId, winner } = req.body;
    const game = activeOnlineGames[gameId];
    if (game) {
      game.winner = winner;
      game.chats.push({
        sender: 'Sistem',
        text: winner === 'draw' ? 'Pertandingan berakhir Seri (Remis)!' : `Skakmat! Pertandingan selesai. Pemenang: ${winner === 'w' ? 'Putih' : 'Hitam'}.`,
        time: Date.now()
      });
    }
    return res.json({ success: true });
  });

  // Seeded Online leaderboard merged with real registered user accounts
  app.get("/api/online/leaderboard", (req, res) => {
    const seed = [
      { name: "Magnus_Carlsen_Fans", elo: 2192, badge: "Grandmaster" },
      { name: "Siti_Catur_Ayunda", elo: 1845, badge: "Master Nasional" },
      { name: "RajaTaktik99", elo: 1620, badge: "Pakar" },
      { name: "Wira_Ksatria", elo: 1422, badge: "Pakar" },
      { name: "Duo_Owl_Hunter", elo: 1350, badge: "Pakar" },
      { name: "Kasparov_Pioneer", elo: 1250, badge: "Pemula Berbakat" },
    ];
    
    try {
      const realUsers = Object.values(usersDb).map(user => ({
        name: user.username,
        elo: user.elo || 400,
        badge: (user.elo || 400) >= 2000 ? "Grandmaster" :
               (user.elo || 400) >= 1650 ? "Master Nasional" :
               (user.elo || 400) >= 1200 ? "Pakar" : "Pecatur Berbakat"
      }));

      // Combine and eliminate duplicates (prioritize real users if clean conflict)
      const combined = [...realUsers];
      for (const s of seed) {
        if (!combined.some(u => u.name.toLowerCase() === s.name.toLowerCase())) {
          combined.push(s);
        }
      }

      combined.sort((a, b) => b.elo - a.elo);
      return res.json(combined);
    } catch (e) {
      return res.json(seed);
    }
  });

  // Vite development middleware vs Static built production bundle
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on port ${PORT}`);
  });
}

startServer();
