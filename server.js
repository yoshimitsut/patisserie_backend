const express = require('express');
const path = require('path');
const cors = require('cors');
const QRcode = require('qrcode');
const nodemailer = require('nodemailer');
require('dotenv').config();

const PORT = process.env.PORT || 3001;

const app = express();
const fs = require('fs');
const { error } = require('console');
const { text } = require('stream/consumers');

app.use(cors());
app.use(express.json());

const orderPath = path.join(__dirname, 'data', 'order.json');

if(!fs.existsSync(orderPath)) {
  fs.writeFileSync(orderPath, JSON.stringify({ orders:[] }, null, 2));
}

//lista pedidos// lista pedidos
app.get('/api/list', (req, res) => {
  fs.readFile(orderPath, 'utf-8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Erro ao ler pedidos.' });
    
    try {
      const parsed = JSON.parse(data);
      const orders = Array.isArray(parsed) ? parsed : (parsed.orders || []);

      const rawSearch = (req.query.search || '').toString().trim();

      // Normalizador: transforma hiragana → katakana
      const toKatakana = (text) => {
        if (!text) return '';
        return String(text)
          .normalize("NFKC")
          .replace(/[\u3041-\u3096]/g, ch =>
            String.fromCharCode(ch.charCodeAt(0) + 0x60)
          )
          .replace(/\s+/g, "")
          .toLowerCase();
      };

      // Apenas números
      const qDigits = rawSearch.replace(/\D/g, "");

      // Apenas katakana/texto
      const qText = toKatakana(rawSearch);

      // Se não digitou nada, retorna todos
      if (!qDigits && !qText) return res.json(orders);

      const filtered = orders.filter(order => {
        const idNum = Number(order.id_order ?? 0);          // Número do ID
        const searchNum = Number(qDigits);                 // Número do input
        const telDigits = String(order.tel ?? "").replace(/\D/g, "");
        const first = toKatakana(order.first_name ?? order.firstName ?? "");
        const last = toKatakana(order.last_name ?? order.lastName ?? "");
        const fullname = toKatakana(`${order.first_name ?? order.firstName ?? ""}${order.last_name ?? order.lastName ?? ""}`);

        // Busca pelo ID exata (numérica)
        if (qDigits && idNum === searchNum) return true;

        // Busca pelo telefone (contém)
        if (qDigits && telDigits.includes(qDigits)) return true;

        // Busca pelo nome (hiragana/katakana normalizado)
        if (qText && (first.includes(qText) || last.includes(qText) || fullname.includes(qText))) return true;

        return false;
      });

      res.json(filtered);

    } catch (e) {
      res.status(500).json({ error: 'Arquivo JSON inválido.' });
    }
  });
});



//salvar pedido e envia qr code por emaill
app.post('/api/reservar', (req, res) => {
  const newOrder = req.body;
  
  fs.readFile(orderPath, 'utf-8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Erro ao ler o arquivo.' });
    
    let json;
    try {
      json = JSON.parse(data);
    } catch (error) {
      return res.status(500).json({ error: 'Arquivo JSON inválido.' });
    }

    const lastId = json.orders.length > 0 ? json.orders[json.orders.length - 1].id_order : 0;
    newOrder.id_order = lastId + 1;

    newOrder.status= "1";

    json.orders.push(newOrder);

    fs.writeFile(orderPath, JSON.stringify(json, null, 2), (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao salvar dados no arquivo json.'})

      //Configurar e-mail
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,       // 465 -> SSL
        secure: true,    // true para 465
        auth: {
          user: process.env.EMAIL_USER, // seu email
          pass: process.env.EMAIL_PASS  // senha de app
        }
      });

      //Qr Code
      QRcode.toDataURL(String(newOrder.id_order), async(err, qrDataUrl) => {
        if (err) {
          console.error('Erro ao gerar QR Code:', err);
          return res.json({ success: true, id:newOrder.id_order, emailSent: false });
        }

        const htmlContent = `
        <h2>🎂 注文ありがとうございます！</h2>
          <p>受付番号: <strong>${newOrder.id_order}</strong></p>
          <p>お名前: ${newOrder.first_name} ${newOrder.last_name}</p>
          <p>電話番号: ${newOrder.tel}</p>
          <p>受け取り日時: ${newOrder.date} - ${newOrder.pickupHour}</p>
          <p>その他: ${newOrder.message} </p>
          <p></p>
          <p>ご注文内容:</p>
          <ul>
            ${newOrder.cakes.map(c => `<li>${c.name} - ${c.size} - ${c.amount}個 - ${c.message_cake}</li>`).join('')}
          </ul>
          <p></p>
          <p>こちらが受付用QRコードです:</p>
          <img src="cid:qrcode" alt="QRコード" width="400" />
          <p>またのご利用をお待ちしております。</p>
        `;

        const mailOptions = {
          from: `"Pâtisserie Cake" <${process.env.EMAIL_USER}>`,
          to: [newOrder.email, process.env.EMAIL_USER], // manda para o cliente E para você
          subject: `🎂 ご注文確認 - 受付番号 ${newOrder.id_order}`,
          html: htmlContent,
          attachments: [
            {
              filename: 'qrcode.png',
              content: qrDataUrl.split("base64,")[1],
              encoding: 'base64',
              cid: 'qrcode',
            },
          ],
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.log('Erro ao Enviar e-mail:', error);
            return res.json({ success: true, id: newOrder.id_order, emailSent: false });
          }
          console.log('E-mail enviado com QR Code!');
          res.json({ success: true, id:newOrder.id_order, emailSent: true });
        });

      });
    });
  });
});

//atualiza pedido
app.put('/api/reservar/:id_order', (req, res) => {
  const id_order = parseInt(req.params.id_order, 10);
  const { status } = req.body;

  fs.readFile(orderPath, 'utf-8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Erro ao ler Arquivo.'});
    
    let json;
    try {
      json = JSON.parse(data);
    } catch (error) {
      return res.status(500).json({ error: 'Arquivo JSON inválido.'})
    }

    const index = json.orders.findIndex(o => o.id_order === id_order);
    if(index === -1){
      return res.status(404).json({ error: 'Pedido não encontrado.' })
    }

    json.orders[index].status = status;

    fs.writeFile(orderPath, JSON.stringify(json, null, 2), (err) => {
      if (err) return res.status(500).json({error: 'Erro ao salvar arquivo.'});
      res.json({success: true, order: json.orders[index]})
    })
  })
});

app.listen(3001, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
})