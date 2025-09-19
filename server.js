const express = require('express');
const path = require('path');
const cors = require('cors');
const QRcode = require('qrcode');
require('dotenv').config();

const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const PORT = process.env.PORT || 3001;

const app = express();
const fs = require('fs');
const { error } = require('console');
const { text } = require('stream/consumers');

app.use(cors());
app.use(express.json());

const orderPath = path.join(__dirname, 'data', 'order.json');
const cakePath = path.join(__dirname, 'data', 'cake.json');

if(!fs.existsSync(orderPath)) {
  fs.writeFileSync(orderPath, JSON.stringify({ orders:[] }, null, 2));
}

const resend = new Resend(process.env.RESEND_API_KEY);

// lista pedidos
app.get('/api/list', (req, res) => {
  fs.readFile(orderPath, 'utf-8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Erro ao ler pedidos.' });
    
    try {
      const parsed = JSON.parse(data);
      const orders = Array.isArray(parsed) ? parsed : (parsed.orders || []);

      const rawSearch = (req.query.search || '').toString().trim();

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

      const qDigits = rawSearch.replace(/\D/g, "");
      const qText = toKatakana(rawSearch);

      const statusLabels = {
        "a": "未",
        "b": "ネット決済済",
        "c": "店頭支払い済",
        "d": "お渡し済",
        "e": "キャンセル",
      };

      if (!qDigits && !qText) return res.json(orders);

      const filtered = [];

      for (const order of orders) {
        const idNum = Number(order.id_order ?? 0);
        const searchNum = Number(qDigits);
        const telDigits = String(order.tel ?? "").replace(/\D/g, "");
        const first = toKatakana(order.first_name ?? "");
        const last = toKatakana(order.last_name ?? "");
        const fullname = toKatakana(`${order.first_name ?? ""}${order.last_name ?? ""}`);

        let match = false;
        let cakeMatches = [];

        // ID
        if (qDigits && idNum === searchNum) match = true;

        // Telefone
        if (qDigits && telDigits.includes(qDigits)) match = true;

        // Nome
        if (qText && (first.includes(qText) || last.includes(qText) || fullname.includes(qText))) match = true;

        // Status (a, b, c...)
        if (qText) {
          const statusCode = String(order.status).toLowerCase();
          const statusLabel = statusLabels[statusCode] || "";
          
          if (statusLabel.includes(rawSearch)) {
            match = true;
          }
        }
        
        // Bolo
        if (qText && order.cakes) {
          cakeMatches = order.cakes.filter(cake => {
            const cakeName = toKatakana(cake.name ?? "");
            return cakeName.includes(qText);
          });
          if (cakeMatches.length > 0) match = true;
        }

        if (match) {
          filtered.push({
            ...order,
            cakes: cakeMatches.length > 0 ? cakeMatches : order.cakes // 🔑 aqui está a lógica
          });
        }
      }

      res.json(filtered);

    } catch (e) {
      res.status(500).json({ error: 'Arquivo JSON inválido.' });
    }
  });
});


app.get('/api/cake', (req, res) => {
  fs.readFile(cakePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Erro ao ler o arquivo cake.json:', err);
      return res.status(500).json({ error: 'Erro ao carregar dados de bolos.' });
    }

    try {
      const cakes = JSON.parse(data);
      res.json(cakes);
    } catch (e) {
      console.error('Erro ao parsear cake.json:', e);
      res.status(500).json({ error: 'Arquivo JSON de bolos inválido.' });
    }
  });
});



//salvar pedido e envia qr code por emaill
app.post('/api/reservar', async (req, res) => {
  const newOrder = req.body;

  try {
    const data = fs.readFileSync(orderPath, 'utf-8');
    const json = JSON.parse(data);

    const lastId = json.orders.length > 0 ? json.orders[json.orders.length - 1].id_order : 0;
    newOrder.id_order = lastId + 1;
    newOrder.status = "a";

    json.orders.push(newOrder);
    fs.writeFileSync(orderPath, JSON.stringify(json, null, 2));

    // Inicializa Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Gera QR Code
    const qrDataUrl = await QRcode.toDataURL(String(newOrder.id_order));

    // Monta HTML
    const htmlContent = `
      <h2>🎂 注文ありがとうございます！</h2>
      <p>受付番号: <strong>${String(newOrder.id_order).padStart(4,"0")}</strong></p>
      <p>お名前: ${newOrder.first_name} ${newOrder.last_name}</p>
      <p>電話番号: ${newOrder.tel}</p>
      <p>受け取り日時: ${newOrder.date} - ${newOrder.pickupHour}</p>
      <p>ご注文内容:</p>
      <ul>
        ${newOrder.cakes.map(c => `<li>${c.name} - ${c.size} - ${c.amount}個 - ${c.message_cake}</li>`).join('')}
      </ul>
      <p>受付用QRコード:</p>
      <img src="${qrDataUrl}" width="400" />
    `;

    // Envia e-mail
    const emailResponse = await resend.emails.send({
      from: "Pedidos <araha-okinawa.online>",
      to: newOrder.email,
      subject: `🎂 ご注文確認 - 受付番号 ${String(newOrder.id_order).padStart(4,"0")}`,
      html: htmlContent
    });

    console.log("Resend response:", emailResponse);
    res.json({ success: true, id: newOrder.id_order });

  } catch (err) {
    console.error("Erro ao salvar pedido ou enviar e-mail:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});




  // fs.readFile(orderPath, 'utf-8', (err, data) => {
  //   if (err) return res.status(500).json({ error: 'Erro ao ler o arquivo.' });
    
  //   let json;
  //   try {
  //     json = JSON.parse(data);
  //   } catch (error) {
  //     return res.status(500).json({ error: 'Arquivo JSON inválido.' });
  //   }

  //   const lastId = json.orders.length > 0 ? json.orders[json.orders.length - 1].id_order : 0;
  //   newOrder.id_order = lastId + 1;

  //   newOrder.status= "a";

  //   json.orders.push(newOrder);

  //   fs.writeFile(orderPath, JSON.stringify(json, null, 2), (err) => {
  //     if (err) return res.status(500).json({ error: 'Erro ao salvar dados no arquivo json.'})

  //     //Configurar e-mail
  //     const transporter = nodemailer.createTransport({
  //       host: "smtp.gmail.com",
  //       port: 465,       // 465 -> SSL
  //       secure: true,    // true para 465
  //       auth: {
  //         user: process.env.EMAIL_USER, // seu email
  //         pass: process.env.EMAIL_PASS  // senha de app
  //       }
  //     });

  //     //Qr Code
  //     QRcode.toDataURL(String(newOrder.id_order), async(err, qrDataUrl) => {
  //       if (err) {
  //         console.error('Erro ao gerar QR Code:', err);
  //         return res.json({ success: true, id:newOrder.id_order, emailSent: false });
  //       }

  //       const htmlContent = `
  //       <h2>🎂 注文ありがとうございます！</h2>
  //         <p>受付番号: <strong>${String(newOrder.id_order).padStart(4, "0")}</strong></p>
  //         <p>お名前: ${newOrder.first_name} ${newOrder.last_name}</p>
  //         <p>電話番号: ${newOrder.tel}</p>
  //         <p>受け取り日時: ${newOrder.date} - ${newOrder.pickupHour}</p>
  //         <p>その他: ${newOrder.message} </p>
  //         <p></p>
  //         <p>ご注文内容:</p>
  //         <ul>
  //           ${newOrder.cakes.map(c => `<li>${c.name} - ${c.size} - ${c.amount}個 - ${c.message_cake}</li>`).join('')}
  //         </ul>
  //         <p></p>
  //         <p>こちらが受付用QRコードです:</p>
  //         <img src="cid:qrcode" alt="QRコード" width="400" />
  //         <p>またのご利用をお待ちしております。</p>
  //       `;

  //       const mailOptions = {
  //         from: `"Pâtisserie Cake" <${process.env.EMAIL_USER}>`,
  //         to: [newOrder.email, process.env.EMAIL_USER], // manda para o cliente E para você
  //         subject: `🎂 ご注文確認 - 受付番号 ${String(newOrder.id_order).padStart(4, "0")}`,
  //         html: htmlContent,
  //         attachments: [
  //           {
  //             filename: 'qrcode.png',
  //             content: qrDataUrl.split("base64,")[1],
  //             encoding: 'base64',
  //             cid: 'qrcode',
  //           },
  //         ],
  //       };

  //       transporter.sendMail(mailOptions, (error, info) => {
  //         if (error) {
  //           console.log('Erro ao Enviar e-mail:', error);
  //           return res.json({ success: true, id: newOrder.id_order, emailSent: false });
  //         }
  //         console.log('E-mail enviado com QR Code!');
  //         res.json({ success: true, id:newOrder.id_order, emailSent: true });
  //       });

  //     });
  //   });
  // });

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

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
})