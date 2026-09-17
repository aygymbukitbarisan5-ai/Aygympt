import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize GoogleGenAI lazily
let aiClient = null;
function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

// Server-side AI Consultation endpoint
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, bmiData, clientName } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Pesan pertanyaan wajib diisi.' });
    }

    const ai = getAiClient();
    if (!ai) {
      // Fallback expert fitness coach response if GEMINI_API_KEY is not yet attached
      const fallbackReply = generateFallbackCoachReply(message, bmiData, clientName);
      return res.json({
        reply: fallbackReply,
        isFallback: true
      });
    }

    let extraContext = '';
    if (bmiData && typeof bmiData === 'object') {
      extraContext = `
[DATA PROFIL & KALKULATOR BMI KLIEN]:
- Nama Klien: ${clientName || 'Klien AY GYM'}
- Berat Badan: ${bmiData.weight || '-'} kg
- Tinggi Badan: ${bmiData.height || '-'} cm
- Skor BMI: ${bmiData.bmi || '-'} (${bmiData.category || '-'})
- Rentang Berat Ideal: ${bmiData.idealWeight || '-'} kg
- Estimasi BMR: ${bmiData.bmr || '-'} kcal
- Estimasi TDEE: ${bmiData.tdee || '-'} kcal/hari
- Target Utama: ${bmiData.goal || 'Kebugaran'}
- Tingkat Aktivitas: ${bmiData.activity || 'Sedang'}
`;
    }

    const systemInstruction = `
Anda adalah "Coach AI AY GYM" — Asisten Personal Trainer & Ahli Nutrisi / Diet bersertifikat resmi dari AY GYM.
Tugas Anda:
1. Membantu klien AY GYM menjawab pertanyaan seputar dunia gym, teknik latihan, program latihan (hypertrophy, strength, fat loss), pola diet/nutrisi (cutting, bulking, deficit kalori, surplus kalori), kebutuhan makronutrien (protein, karbohidrat, lemak), serta pemulihan (recovery, tidur, suplemen aman).
2. Jika ada data BMI atau profil klien yang disertakan, selalu gunakan data tersebut untuk memberikan saran yang spesifik, relevan, dan terpersonalisasi.
3. Selalu prioritaskan keamanan, form latihan yang benar, dan pendekatan nutrisi sehat yang realistis (utamakan makanan lokal Indonesia seperti dada ayam, tempe, tahu, telur, ikan, nasi merah/putih terkontrol).
4. Gunakan gaya bahasa ramah, suportif, profesional, bersemangat (khas Personal Trainer), dan mudah dipahami dalam Bahasa Indonesia.
5. Gunakan format markdown yang rapi (bullet points, bolding) agar nyaman dibaca di smartphone.
`;

    const contents = [];
    if (extraContext) {
      contents.push({ text: extraContext });
    }
    contents.push({ text: message });

    const callWithTimeout = (promise, ms = 6000) =>
      Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('API call timeout')), ms))
      ]);

    let reply = '';
    try {
      const response = await callWithTimeout(ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: contents
        },
        config: {
          systemInstruction,
          temperature: 0.7
        }
      }), 6000);
      reply = response.text || '';
    } catch (primaryErr) {
      console.warn('Primary model error, attempting gemini-3.8-flash or fallback:', primaryErr.message);
      try {
        const response2 = await callWithTimeout(ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: {
            parts: contents
          },
          config: {
            systemInstruction,
            temperature: 0.7
          }
        }), 6000);
        reply = response2.text || '';
      } catch (secondaryErr) {
        console.warn('Secondary model error, using expert coach fallback:', secondaryErr.message);
        reply = generateFallbackCoachReply(message, bmiData, clientName);
        return res.json({ reply, isFallback: true });
      }
    }

    return res.json({ reply: reply || 'Maaf, tidak ada tanggapan yang dihasilkan.' });
  } catch (err) {
    console.error('Gemini AI API Error:', err);
    const fallbackReply = generateFallbackCoachReply(req.body?.message, req.body?.bmiData, req.body?.clientName);
    return res.json({
      reply: fallbackReply,
      isFallback: true
    });
  }
});

function generateFallbackCoachReply(message, bmiData, clientName) {
  const q = (message || '').toLowerCase();
  const name = clientName || 'Klien AY GYM';
  const weight = bmiData?.weight ? `${bmiData.weight} kg` : null;
  const bmi = bmiData?.bmi ? `${bmiData.bmi} (${bmiData.category})` : null;
  const tdee = bmiData?.tdee ? `${bmiData.tdee} kcal` : null;

  let header = `Halo **${name}**! Salam bugar dari Coach AY GYM 💪\n\n`;

  if (bmiData && (bmiData.weight || bmiData.bmi)) {
    header += `> 📊 **Data Profil Anda:** Berat: ${weight || '-'} | BMI: ${bmi || '-'} | Estimasi TDEE: ${tdee || '-'}\n\n`;
  }

  if (q.includes('menu') || q.includes('makan') || q.includes('diet') || q.includes('pola makan') || q.includes('sarapan')) {
    return header + `### 🥗 Panduan Pola Diet & Contoh Menu Sehat Harian

Untuk mendukung latihan di AY GYM, pola makan harus seimbang antara makronutrien (Protein, Karbohidrat kompleks, & Lemak sehat):

**1. Pagi / Sarapan (07:00 - 08:30):**
- 3 butir telur (2 putih telur + 1 butir utuh) direbus atau diorak-arik minyak zaitun/sedikit mentega.
- 1-2 lembar roti gandum utuh atau oatmeal (40-50g) + pisang/apel.
- 1 gelas air putih hangat (300-500ml).

**2. Makan Siang (12:00 - 13:30):**
- 150g dada ayam panggang/kukus, ikan tongkol/tenggiri, atau tempe tahu tebal.
- 1 porsi sedang nasi merah / nasi putih (100-150g).
- Sayuran hijau melimpah (bayam, brokoli, atau buncis rebus).

**3. Pre-Workout Snack (1-2 jam sebelum gym):**
- 1 buah pisang ambon + 1 scoop whey protein atau 2 butir telur rebus untuk energi optimal.

**4. Post-Workout (30-60 menit setelah gym):**
- Asupan protein cepat serap (dada ayam atau whey protein shake).

**5. Makan Malam (18:30 - 20:00):**
- 120-150g sumber protein (daging sapi tanpa lemak / ikan / dada ayam).
- Tumis sayuran dan kentang kukus atau ubi jalar manis.

💡 **Tips Penting:** Minum air putih minimal 2.5 - 3.5 liter per hari untuk menjaga sintesis protein dan pemulihan otot maksimal!`;
  }

  if (q.includes('protein') || q.includes('suplemen') || q.includes('creatine') || q.includes('whey')) {
    const proteinNeeds = bmiData?.weight ? Math.round(bmiData.weight * 1.8) + ' - ' + Math.round(bmiData.weight * 2.2) + ' gram/hari' : '1.6 - 2.2 gram per kg berat badan';
    return header + `### 🥩 Kebutuhan Protein & Panduan Suplementasi Gym

**Berapa protein yang Anda butuhkan?**
Berdasarkan standar sport nutrition: **${proteinNeeds}**.

**Sumber Protein Lokal Terbaik & Hemat:**
1. **Dada Ayam Fillet:** ~31g protein per 100g (sumber paling efisien dan rendah lemak).
2. **Telur Ayam:** ~6g protein per butir (asam amino lengkap & tinggi bioavailabilitas).
3. **Tempe & Tahu:** ~19g protein per 100g tempe (nabati sehat, kaya serat).
4. **Ikan Laut (Tongkol, Kembung, Bandeng):** ~20-25g protein + kaya asam lemak Omega-3 anti-inflamasi.

**Mengenai Suplemen:**
- **Whey Protein:** Sangat praktis untuk mencukupi target protein harian bila dari makanan utuh masih kurang.
- **Creatine Monohydrate:** Suplemen paling terbukti riset (3-5 gram per hari) untuk menambah tenaga, daya angkat beban, dan hidrasi intraseluler otot.
- *Fokus utama tetap pada makanan padat harian (whole foods) terlebih dahulu!*`;
  }

  if (q.includes('bmi') || q.includes('kurus') || q.includes('gemuk') || q.includes('berat badan') || q.includes('ideal') || q.includes('fat loss') || q.includes('turun')) {
    return header + `### ⚖️ Strategi Menuju Berat Badan Ideal & Fat Loss

**1. Prinsip Defisit Kalori Terkendali:**
- Kurangi asupan kalori sebesar **300 - 500 kcal** di bawah TDEE (Total Daily Energy Expenditure) Anda.
- Jangan kurangi kalori terlalu ekstrem (>800 kcal) karena dapat memicu kehilangan massa otot dan memperlambat metabolisme.

**2. Latihan Beban di AY GYM adalah Kunci:**
- Jangan hanya cardio! Latihan beban mempertahankan massa otot (*lean mass*), sehingga tubuh membakar kalori lebih banyak bahkan saat Anda sedang istirahat.
- Lakukan latihan compound seperti Squat, Bench Press, Lat Pulldown, dan Deadlift 3-4 kali seminggu.

**3. Kontrol Nafsu Makan:**
- Perbanyak konsumsi serat (sayur & buah) dan protein di setiap piring makan agar kenyang lebih lama.
- Batasi minuman manis, gorengan bertepung, dan camilan ultra-proses.`;
  }

  if (q.includes('bulking') || q.includes('cutting') || q.includes('rekomposisi')) {
    return header + `### 🔄 Perbedaan Bulking vs Cutting vs Rekomposisi Tubuh

**1. Bulking (Menambah Massa Otot):**
- **Fokus:** Menambah ukuran otot dan kekuatan.
- **Nutrisi:** Surplus kalori bersih (+250 hingga +400 kcal di atas TDEE).
- **Cocok untuk:** Klien dengan BMI normal-rendah atau yang ingin membesarkan massa otot secara optimal.

**2. Cutting (Membakar Lemak):**
- **Fokus:** Mengikis kadar lemak tubuh (*body fat*) sambil mempertahankan otot sekeras mungkin.
- **Nutrisi:** Defisit kalori (-300 hingga -500 kcal) dengan asupan protein tetap tinggi (2.0 - 2.2g/kg BB).
- **Cocok untuk:** Klien dengan BMI di atas normal atau yang ingin definisi otot terlihat tajam (*lean & toned*).

**3. Body Recomposition (Rekomposisi Tubuh):**
- **Fokus:** Membakar lemak sekaligus membentuk otot bersamaan.
- **Nutrisi:** Kalori di angka maintenance/sedikit defisit (-150 kcal), protein sangat tinggi, dan latihan beban progresif teratur.
- **Sangat efektif untuk pemula gym di tahun pertama!**`;
  }

  // General default answer
  return header + `### 🏋️ Panduan Latihan & Kebugaran AY GYM

Terima kasih atas pertanyaan Anda seputar dunia fitness dan pola makan!

Berikut adalah 4 pilar utama keberhasilan fitness Anda:
1. **Progressive Overload:** Tingkatkan beban, repetisi, atau kualitas form latihan Anda secara bertahap setiap minggu agar otot terus beradaptasi dan berkembang.
2. **Nutrisi Terukur:** Pastikan konsumsi protein cukup (1.6 - 2.2g/kg BB) dan sesuaikan asupan kalori dengan target Anda (Fat loss = defisit, Muscle build = surplus ringan).
3. **Istirahat & Pemulihan:** Otot bertumbuh saat Anda tidur nyenyak (7-8 jam per malam), bukan saat sedang diangkat di gym!
4. **Konsistensi Pertemuan:** Jadwalkan latihan rutin bersama Personal Trainer AY GYM untuk koreksi gerakan dan menjaga kedisiplinan.

💡 *Anda juga bisa menanyakan contoh menu diet, cara menghitung gram protein, atau gerakan gym spesifik kepada saya kapan saja!*`;
}

const isProd = process.env.NODE_ENV === 'production';
const staticDir = (isProd && fs.existsSync(path.join(__dirname, 'dist')))
  ? path.join(__dirname, 'dist')
  : __dirname;

app.use(express.static(staticDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

