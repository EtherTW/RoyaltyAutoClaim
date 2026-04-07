# circuits

```
cd title_hash
nargo compile
nargo info
```

```
bun run script/genProofTitleHash.ts ../emails/test.eml
bun run script/genVerifier.ts title_hash
```

## Circuit projects

-   title_hash: extract the title hash from an email
-   subject_decoding: decode the subject to extract the title
-   lib: circuits library
