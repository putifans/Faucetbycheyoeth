require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname))); // Sirve archivos estáticos desde la raíz

// Almacén de últimos reclamos por IP (en memoria)
const lastClaims = {};

// Configuración FaucetPay
const FAUCETPAY_API_URL = 'https://faucetpay.io/api/v1/send';
const FAUCETPAY_API_KEY = process.env.FAUCETPAY_API_KEY;
const AMOUNT = 0.00000004;   // ETH
const CURRENCY = 'ETH';
const COOLDOWN_SECONDS = 15;

// Validación de API Key
if (!FAUCETPAY_API_KEY) {
  console.error('❌ ERROR: No se encontró FAUCETPAY_API_KEY en el archivo .env');
  process.exit(1);
}
console.log('✅ API Key cargada correctamente');

// Función para obtener IP real del cliente
const getClientIp = (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
};

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Ruta para reclamar
app.post('/claim', async (req, res) => {
  const { username } = req.body;
  const ip = getClientIp(req);

  // Validar nombre de usuario
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ success: false, message: 'Debes proporcionar un nombre de usuario de FaucetPay.' });
  }

  // Verificar cooldown
  const now = Date.now();
  const lastClaim = lastClaims[ip];
  if (lastClaim && (now - lastClaim) < COOLDOWN_SECONDS * 1000) {
    const remaining = Math.ceil((COOLDOWN_SECONDS * 1000 - (now - lastClaim)) / 1000);
    return res.status(429).json({
      success: false,
      message: `Debes esperar ${remaining} segundos antes de volver a reclamar.`
    });
  }

  try {
    // Llamar a la API de FaucetPay
    const response = await axios.post(FAUCETPAY_API_URL, null, {
      params: {
        api_key: FAUCETPAY_API_KEY,
        to: username.trim(),
        amount: AMOUNT,
        currency: CURRENCY
      }
    });

    const data = response.data;

    if (data.status === 200) {
      // Éxito: guardamos el tiempo de este reclamo
      lastClaims[ip] = now;
      return res.json({
        success: true,
        message: `✅ ¡Reclamo exitoso! Se enviaron ${AMOUNT} ETH a ${username}.`,
        txid: data.txid
      });
    } else {
      // Error de FaucetPay (saldo insuficiente, usuario inválido, etc.)
      return res.status(400).json({
        success: false,
        message: data.message || 'Error al enviar el pago. Verifica tu usuario y saldo.'
      });
    }
  } catch (error) {
    console.error('Error en petición a FaucetPay:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Ocurrió un error interno. Por favor, intenta más tarde.'
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
