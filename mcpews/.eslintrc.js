module.exports = {
    env: {
        commonjs: true,
        es2021: true,
        node: true
    },
    extends: ["airbnb-base"],
    parserOptions: {
        ecmaVersion: "latest"
    },
    rules: {
        indent: ["error", 4, { SwitchCase: 1 }],
        "linebreak-style": ["error", "windows"],
        quotes: ["error", "double"],
        semi: ["error", "always"],
        "max-classes-per-file": ["error", 3],
        "no-bitwise": ["error", { allow: ["<<", "&"] }],
        "no-param-reassign": ["error", { props: false }],
        "comma-dangle": ["error", "never"],
        "max-len": ["error", { code: 120 }]
    }
};
