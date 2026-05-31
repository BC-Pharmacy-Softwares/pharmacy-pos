#!/bin/bash
echo "============================================================"
echo " Pharmacy POS — Setup"
echo "============================================================"

# 1. Download browser libraries
mkdir -p lib

echo "Downloading sql.js (SQLite in WebAssembly)..."
curl -L "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js"   -o lib/sql-wasm.js
curl -L "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm" -o lib/sql-wasm.wasm

echo "Downloading bcrypt.js (password hashing)..."
curl -L "https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js" -o lib/bcrypt.min.js

# 2. Set up Clover bridge service
echo ""
echo "Setting up Clover Local Pay bridge..."
cd clover-local-pay

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "  *** ACTION REQUIRED ***"
  echo "  Edit clover-local-pay/.env and set your Clover device IP address."
  echo "  (Open Network Pay Display on your Clover terminal — the IP is shown on screen.)"
  echo ""
fi

npm install --silent
cd ..

echo ""
echo "============================================================"
echo " Setup complete!"
echo ""
echo " HOW TO RUN:"
echo "   Terminal 1: cd clover-local-pay && node server.js"
echo "   Terminal 2: npx serve -p 8082 (or python3 -m http.server 8082)"
echo "   Browser:    http://localhost:8082"
echo ""
echo " FIRST TIME?"
echo "   1. Open clover-local-pay/.env and set CLOVER_DEVICE_IP"
echo "   2. Start the Clover bridge (Terminal 1)"
echo "   3. Open the POS in your browser"
echo "   4. Go to Settings → Clover and click Pair"
echo "   5. Enter the pairing code shown on your Clover terminal"
echo "============================================================"
