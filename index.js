require("dotenv").config();
const express = require("express");
const fs = require("fs");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL;
const EXTERNAL_API_TOKEN = process.env.EXTERNAL_API_TOKEN;

let balances = {};

try {
    if (fs.existsSync("balances.json")) {
        balances = JSON.parse(fs.readFileSync("balances.json", "utf8"));
    }
} catch (err) {
    console.error("Error reading balances.json:", err);
}

function log(...args) {
    console.log("[LOG]", ...args);
}

app.post("/debin", async (req, res) => {
    const { walletId, bankAccountId, amount } = req.body;

    if (!walletId || !bankAccountId || !amount) {
        return res.status(400).json({ error: "walletId, bankAccountId y amount son requeridos" });
    }

    let accountDoesNotExists = !doesAccountExist(bankAccountId);

    if (accountDoesNotExists) {
        return res.status(404).json({ error: "Cuenta bancaria no encontrada" });
    }


    if (balances[bankAccountId] < amount) {
        return res.status(400).json({ error: "Fondos insuficientes" });
    }

    try {
        const externalLoadRequest = {
            walletEmail: walletId,
            amount: amount,
            externalServiceName: "Bank",
            externalServiceType: "BANK",
            externalServiceEmail: bankAccountId
        };

        const response = await axios.post(
            `${EXTERNAL_API_URL}/external-load`,
            externalLoadRequest,
            {
                headers: {
                    "X-API-TOKEN": process.env.EXTERNAL_API_TOKEN,
                },
            }
        );

        balances[bankAccountId] = (balances[bankAccountId]) - amount;
        res.json({
            message: "Solicitud DEBIN procesada correctamente",
            result: response.data,
        });
    } catch (err) {
        res.status(500).json({
            error: "Error al procesar la transferencia DEBIN",
            detail: err.message,
        });
    }
});

function doesAccountExist(fromAccountId) {
    return balances[fromAccountId] !== undefined;
}

app.post("/transfer", async (req, res) => {
    const { fromAccountId, toWalletId, amount } = req.body;

    if (!fromAccountId || !toWalletId || !amount) {
        return res.status(400).json({ error: "fromAccountId, toWalletId y amount son requeridos" });
    }

    let accountDoesNotExists = !doesAccountExist(fromAccountId);

    if (accountDoesNotExists) {
        return res.status(404).json({ error: "Cuenta bancaria no encontrada" });
    }

    if (balances[fromAccountId] < amount) {
        return res.status(400).json({ error: "Fondos insuficientes" });
    }

    try {
        const response = await axios.post(
            `${EXTERNAL_API_URL}/external_load`,
            {
                fromAccountId,
                walletId: toWalletId,
                amount,
            },
            {
                headers: {
                    Authorization: `Bearer ${EXTERNAL_API_TOKEN}`,
                },
            }
        );


        balances[toWalletId] = (balances[toWalletId] || 0) - amount;
        fs.writeFileSync("balances.json", JSON.stringify(balances, null, 2));

        log(`Transferencia: ${amount} desde ${fromAccountId} hacia wallet ${toWalletId}`);

        res.json({
            message: "Transferencia exitosa",
            externalResponse: response.data,
            newBalance: balances[toWalletId],
        });
    } catch (err) {
        log("Error al llamar a external_load:", err.message);
        res.status(500).json({
            error: "Fallo en external_load",
            detail: err.message,
        });
    }
});

app.listen(PORT, () => {
    log(`API simulada escuchando en http://localhost:${PORT}`);
});
