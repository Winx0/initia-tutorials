import { AccAddress, MsgExecute, BCS } from '@initia/initia.js';
import { 
    lcd,
    wallet,
    key
} from './config';
  
async function swap() {
    const myAddr = key.accAddress;
    const bcs = BCS.getInstance();

    let myBalance = await lcd.bank.balance(myAddr);
    console.log("------------------Before Swap------------------");
    console.log("my balances:", myBalance[0].map((coin) => coin.toString()));

    const msgs = [];

    // Check if the account is registered on the DEX module
    const isDexRegistered = await lcd.move.viewFunction(
        "0x1",
        "dex",
        "is_account_registered",
        [],
        [bcs.serialize("address", AccAddress.toHex(myAddr))]
    );
    if (!isDexRegistered) {
        console.log("account is not registered on dex, registering...")
        const registerMsg = new MsgExecute(
            myAddr,
            "0x1",
            "dex",
            "register", 
            [],
            []
        );
        msgs.push(registerMsg);
    }

    // Check if native_usdc is registered on CoinStore
    const isUsdcRegistered = await lcd.move.viewFunction(
        "0x1", // module owner
        "coin", // module name
        "is_account_registered", // function name
        ["0x1::native_uusdc::Coin"],
        [bcs.serialize("address", AccAddress.toHex(myAddr))]
    );
    if (!isUsdcRegistered) {
        console.log("uusdc is not registered on CoinStore, registering...")
        const registerMsg = new MsgExecute(
            myAddr,
            "0x1",
            "coin",
            "register",
            ["0x1::native_uusdc::Coin"],
            []
        );

        msgs.push(registerMsg);
    }

    // Create pair if not exist
    const isPairExist = await lcd.move.viewFunction(
        "0x1",
        "dex",
        "is_listed",
        [
            '0x1::native_uinit::Coin', // coin a,
            '0x1::native_uusdc::Coin', // coin b
            `${AccAddress.toHex(myAddr)}::coins::LP<0x1::native_uusdc::Coin, 0x1::native_uinit::Coin>`, // lp token
        ],
        [],
    );

    if (!isPairExist) {
        console.log("Pair does not exist, creating pair...")
        const createPairMsg = new MsgExecute(
            myAddr,
            '0x1',
            'dex',
            'create_pair_script',
            [
                '0x1::native_uinit::Coin', // coin a
                '0x1::native_uusdc::Coin', // coin b
                `${AccAddress.toHex(myAddr)}::coins::LP<0x1::native_uusdc::Coin, 0x1::native_uinit::Coin>`, // lp token
            ],
            [
                bcs.serialize('string', 'MyFirstLP'), // name
                bcs.serialize('string', 'myFirstSymbol'), // symbol
                bcs.serialize('string', '0.5'), // coin a weight
                bcs.serialize('string', '0.5'), // coin b weight
                bcs.serialize('string', '0.003'), // swap fee rate
                bcs.serialize('u64', 1000), // initial coin a amount
                bcs.serialize('u64', 0), // initial coin b amount
            ]
        );

        msgs.push(createPairMsg);
    }

    // Create a message to execute the 'swap_script' function on the 'dex' module, owned by 'module owner' and sent from 'myAddr'
    const swapMsg = new MsgExecute(
        myAddr,
        "0x1",
        "dex",
        "swap_script",
        // [offer coin type, return coin type, lp coin type], type arguments
        ["0x1::native_uinit::Coin", "0x1::native_uusdc::Coin", `${AccAddress.toHex(myAddr)}::coins::LP<0x1::native_uusdc::Coin, 0x1::native_uinit::Coin>`],
        [
            bcs.serialize("u64", 100000), // offer amount
            bcs.serialize("option<u64>", null), // min return
        ]
    );

    msgs.push(swapMsg);

    const signedTx = await wallet.createAndSignTx({ msgs });
    const broadcastResult = await lcd.tx.broadcast(signedTx);

    console.log("\nTX broadcasted, waiting for the result\n");

    // Poll the transaction to wait for block creation
    let polling = setInterval(async () => {
        const txResult = await lcd.tx
            .txInfo(broadcastResult.txhash)
            .catch((_) => undefined);

        if (txResult) {
            clearInterval(polling);

            // Reload the balance after the swap
            myBalance = await lcd.bank.balance(myAddr);

            console.log("------------------After Swap------------------");
            console.log("my balances: ", myBalance[0].map((coin) => coin.toString()));
        }
    }, 1000);
}

swap()