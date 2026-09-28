/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/hodlpay.json`.
 */
export type Hodlpay = {
  "address": "5WWDSNYRjmU3Jp7DywyYgDYtYiBBZ3e8JmcBgS2HxihH",
  "metadata": {
    "name": "hodlpay",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addAsset",
      "discriminator": [
        81,
        53,
        134,
        142,
        243,
        73,
        42,
        179
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "asset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "addAssetArgs"
            }
          }
        }
      ]
    },
    {
      "name": "checkHealth",
      "discriminator": [
        71,
        59,
        207,
        58,
        136,
        156,
        153,
        7
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "checkout",
      "discriminator": [
        7,
        91,
        236,
        227,
        107,
        242,
        64,
        61
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position"
              },
              {
                "kind": "account",
                "path": "position.loanCount",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "merchant"
        },
        {
          "name": "merchantUsdc",
          "writable": true
        },
        {
          "name": "liquidityVault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "asset.mint",
                "account": "collateralAsset"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositLiquidity",
      "discriminator": [
        245,
        99,
        59,
        25,
        151,
        71,
        233,
        249
      ],
      "accounts": [
        {
          "name": "provider",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "providerUsdc",
          "writable": true
        },
        {
          "name": "providerLp",
          "writable": true
        },
        {
          "name": "liquidityVault",
          "writable": true
        },
        {
          "name": "lpMint",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "liquidityVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  113,
                  117,
                  105,
                  100,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "lpMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  112,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializeArgs"
            }
          }
        }
      ]
    },
    {
      "name": "liquidate",
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "liquidator",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position.owner",
                "account": "position"
              }
            ]
          }
        },
        {
          "name": "asset",
          "docs": [
            "Collateral asset to seize."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "asset.mint",
                "account": "collateralAsset"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "liquidatorUsdc",
          "writable": true
        },
        {
          "name": "liquidatorCollateral",
          "writable": true
        },
        {
          "name": "liquidityVault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "repayAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "openPosition",
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "refreshPrice",
      "discriminator": [
        253,
        61,
        142,
        248,
        9,
        32,
        158,
        32
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "asset.mint",
                "account": "collateralAsset"
              }
            ]
          }
        },
        {
          "name": "priceUpdate"
        }
      ],
      "args": []
    },
    {
      "name": "repay",
      "discriminator": [
        234,
        103,
        67,
        82,
        208,
        234,
        219,
        166
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          },
          "relations": [
            "loan"
          ]
        },
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "position"
              },
              {
                "kind": "account",
                "path": "loan.index",
                "account": "loan"
              }
            ]
          }
        },
        {
          "name": "userUsdc",
          "writable": true
        },
        {
          "name": "liquidityVault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "setKeeper",
      "discriminator": [
        102,
        94,
        23,
        78,
        157,
        222,
        243,
        214
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updatePrice",
      "discriminator": [
        61,
        34,
        117,
        155,
        75,
        34,
        123,
        208
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "asset.mint",
                "account": "collateralAsset"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "priceE6",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "asset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "asset.mint",
                "account": "collateralAsset"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawLiquidity",
      "discriminator": [
        149,
        158,
        33,
        185,
        47,
        243,
        253,
        31
      ],
      "accounts": [
        {
          "name": "provider",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "providerUsdc",
          "writable": true
        },
        {
          "name": "providerLp",
          "writable": true
        },
        {
          "name": "liquidityVault",
          "writable": true
        },
        {
          "name": "lpMint",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "collateralAsset",
      "discriminator": [
        254,
        180,
        112,
        90,
        72,
        6,
        245,
        149
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "loan",
      "discriminator": [
        20,
        195,
        70,
        117,
        165,
        227,
        182,
        1
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "events": [
    {
      "name": "checkoutEvent",
      "discriminator": [
        7,
        91,
        27,
        228,
        146,
        50,
        103,
        111
      ]
    },
    {
      "name": "liquidationEvent",
      "discriminator": [
        3,
        13,
        21,
        93,
        173,
        136,
        72,
        144
      ]
    },
    {
      "name": "liquidityEvent",
      "discriminator": [
        164,
        92,
        200,
        16,
        136,
        60,
        73,
        17
      ]
    },
    {
      "name": "marginEvent",
      "discriminator": [
        81,
        83,
        212,
        74,
        29,
        202,
        11,
        27
      ]
    },
    {
      "name": "repayEvent",
      "discriminator": [
        129,
        213,
        0,
        108,
        218,
        108,
        82,
        140
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "invalidLtv",
      "msg": "LTV parameters must satisfy max < margin < liquidation < 100%"
    },
    {
      "code": 6002,
      "name": "invalidParam",
      "msg": "Invalid protocol parameter"
    },
    {
      "code": 6003,
      "name": "invalidPrice",
      "msg": "Price must be greater than zero"
    },
    {
      "code": 6004,
      "name": "stalePrice",
      "msg": "Oracle price is stale"
    },
    {
      "code": 6005,
      "name": "overflow",
      "msg": "Math overflow"
    },
    {
      "code": 6006,
      "name": "positionFull",
      "msg": "All collateral slots are in use"
    },
    {
      "code": 6007,
      "name": "assetNotInPosition",
      "msg": "Collateral asset not found in position"
    },
    {
      "code": 6008,
      "name": "insufficientCollateral",
      "msg": "Not enough collateral deposited"
    },
    {
      "code": 6009,
      "name": "missingAssetAccount",
      "msg": "A collateral asset account required for valuation is missing"
    },
    {
      "code": 6010,
      "name": "insufficientCredit",
      "msg": "Not enough available credit"
    },
    {
      "code": 6011,
      "name": "exceedsMaxLtv",
      "msg": "Withdrawal would exceed the max LTV"
    },
    {
      "code": 6012,
      "name": "loanRepaid",
      "msg": "Loan is already fully repaid"
    },
    {
      "code": 6013,
      "name": "notLiquidatable",
      "msg": "Position is not liquidatable"
    },
    {
      "code": 6014,
      "name": "exceedsCloseFactor",
      "msg": "Repay amount exceeds the close factor"
    },
    {
      "code": 6015,
      "name": "insufficientLiquidity",
      "msg": "Not enough idle liquidity: funds are lent out"
    },
    {
      "code": 6016,
      "name": "invalidPriceUpdate",
      "msg": "Invalid Pyth price update account"
    },
    {
      "code": 6017,
      "name": "feedMismatch",
      "msg": "Price update is for a different feed"
    },
    {
      "code": 6018,
      "name": "priceUncertain",
      "msg": "Oracle confidence interval too wide"
    }
  ],
  "types": [
    {
      "name": "addAssetArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maxLtvBps",
            "type": "u16"
          },
          {
            "name": "marginLtvBps",
            "type": "u16"
          },
          {
            "name": "liquidationLtvBps",
            "type": "u16"
          },
          {
            "name": "priceE6",
            "type": "u64"
          },
          {
            "name": "pythFeedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "checkoutEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "loan",
            "type": "pubkey"
          },
          {
            "name": "principal",
            "type": "u64"
          },
          {
            "name": "merchantReceived",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "collateralAsset",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "priceE6",
            "docs": [
              "USD price of one whole token, 6 decimals."
            ],
            "type": "u64"
          },
          {
            "name": "priceUpdatedAt",
            "type": "i64"
          },
          {
            "name": "maxLtvBps",
            "type": "u16"
          },
          {
            "name": "marginLtvBps",
            "type": "u16"
          },
          {
            "name": "liquidationLtvBps",
            "type": "u16"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "pythFeedId",
            "docs": [
              "Pyth feed id; all zeros means keeper-posted prices only."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "docs": [
              "Posts oracle prices and runs liquidations."
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "liquidityVault",
            "type": "pubkey"
          },
          {
            "name": "merchantFeeBps",
            "type": "u16"
          },
          {
            "name": "liquidationBonusBps",
            "type": "u16"
          },
          {
            "name": "closeFactorBps",
            "docs": [
              "Max share of debt a single liquidation may repay."
            ],
            "type": "u16"
          },
          {
            "name": "installments",
            "type": "u8"
          },
          {
            "name": "installmentInterval",
            "type": "i64"
          },
          {
            "name": "maxPriceAge",
            "type": "i64"
          },
          {
            "name": "totalDebt",
            "type": "u64"
          },
          {
            "name": "lpMint",
            "docs": [
              "Share token for liquidity providers; pool value = idle liquidity + outstanding debt."
            ],
            "type": "pubkey"
          },
          {
            "name": "lateFeeBps",
            "docs": [
              "Charged on an installment paid later than `next_due_at + grace_period`."
            ],
            "type": "u16"
          },
          {
            "name": "gracePeriod",
            "type": "i64"
          },
          {
            "name": "feesEarned",
            "docs": [
              "Lifetime merchant fees + late fees accrued to liquidity providers."
            ],
            "type": "u64"
          },
          {
            "name": "unearnedFees",
            "docs": [
              "Merchant fees on open loans, earned installment by installment. Excluded",
              "from pool value so LPs cannot capture a fee by depositing around a checkout."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "initializeArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "merchantFeeBps",
            "type": "u16"
          },
          {
            "name": "liquidationBonusBps",
            "type": "u16"
          },
          {
            "name": "closeFactorBps",
            "type": "u16"
          },
          {
            "name": "installments",
            "type": "u8"
          },
          {
            "name": "installmentInterval",
            "type": "i64"
          },
          {
            "name": "maxPriceAge",
            "type": "i64"
          },
          {
            "name": "lateFeeBps",
            "type": "u16"
          },
          {
            "name": "gracePeriod",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "liquidationEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "repaid",
            "type": "u64"
          },
          {
            "name": "seized",
            "type": "u64"
          },
          {
            "name": "badDebt",
            "docs": [
              "Debt written off because the position has no collateral left."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "liquidityEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "provider",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "deposit",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "loan",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "merchant",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "principal",
            "type": "u64"
          },
          {
            "name": "merchantReceived",
            "type": "u64"
          },
          {
            "name": "installmentAmount",
            "type": "u64"
          },
          {
            "name": "installmentsTotal",
            "type": "u8"
          },
          {
            "name": "installmentsPaid",
            "type": "u8"
          },
          {
            "name": "repaid",
            "type": "u64"
          },
          {
            "name": "lateFeesPaid",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "feeEarned",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "nextDueAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marginEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "debt",
            "type": "u64"
          },
          {
            "name": "marginLimit",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mints",
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "amounts",
            "type": {
              "array": [
                "u64",
                4
              ]
            }
          },
          {
            "name": "debt",
            "docs": [
              "Outstanding debt in USDC base units."
            ],
            "type": "u64"
          },
          {
            "name": "creditBalance",
            "docs": [
              "Debt already covered by liquidations, consumed by upcoming installments."
            ],
            "type": "u64"
          },
          {
            "name": "loanCount",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "repayEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "loan",
            "type": "pubkey"
          },
          {
            "name": "installment",
            "type": "u8"
          },
          {
            "name": "paid",
            "type": "u64"
          },
          {
            "name": "fromCredit",
            "type": "u64"
          },
          {
            "name": "lateFee",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "assetSeed",
      "type": "bytes",
      "value": "[97, 115, 115, 101, 116]"
    },
    {
      "name": "collateralVaultSeed",
      "type": "bytes",
      "value": "[99, 111, 108, 108, 97, 116, 101, 114, 97, 108, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "liquiditySeed",
      "type": "bytes",
      "value": "[108, 105, 113, 117, 105, 100, 105, 116, 121]"
    },
    {
      "name": "loanSeed",
      "type": "bytes",
      "value": "[108, 111, 97, 110]"
    },
    {
      "name": "lpMintSeed",
      "type": "bytes",
      "value": "[108, 112, 95, 109, 105, 110, 116]"
    },
    {
      "name": "positionSeed",
      "type": "bytes",
      "value": "[112, 111, 115, 105, 116, 105, 111, 110]"
    }
  ]
};
