This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Comparison with FedMinutes

This project is a companion to [FedMinutes](https://github.com/murguia/FedMinutes). They're quite different:

| Aspect | FedMinutes | fedmin-chat |
|--------|-----------|-------------|
| Type | Python backend + Jupyter notebooks | Next.js web app |
| Interface | Notebooks for researchers | Chat UI for end users |
| Output | Academic reports (HTML/PDF) | Conversational responses |
| Interaction | Run cells, view dataframes | Type questions, get answers |
| Deployment | Local/research use | Vercel/web deployment |

**FedMinutes** is a research tool - you run notebooks, execute semantic searches, generate formal reports with citations and timelines. It's designed for deep analysis.

**fedmin-chat** is a consumer-facing chat app - users ask questions in plain English and get conversational answers with collapsible source citations. It's built on the same underlying data but optimized for quick Q&A.

They complement each other:
- Use FedMinutes for serious research and report generation
- Use fedmin-chat for quick lookups and sharing with others who don't want to run notebooks
