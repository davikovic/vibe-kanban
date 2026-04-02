# KanbanFlow

Organizador de tarefas Kanban moderno feito com Electron + Node.js.

## Instalação e Execução

### Pré-requisitos
- [Node.js](https://nodejs.org/) (v18 ou superior)
- npm (incluso com Node.js)

### Passos

```bash
# 1. Entre na pasta do projeto
cd kanban-app

# 2. Instale as dependências
npm install

# 3. Rode o app
npm start
```

## Funcionalidades

- **Board Kanban** com 4 colunas: A Fazer, Em Progresso, Em Revisão, Concluído
- **Drag & Drop** entre colunas
- **Timer automático**: tarefas em "Concluído" são movidas para a tela Completed após 1 minuto
- **Backlog**: tarefas sem status definido ficam aqui
- **Completed**: histórico de tarefas finalizadas
- **Tema Dark/Light** com toggle no sidebar
- **Situações customizáveis** na tela de Settings
- **Banco de dados local** (JSON) — sem internet necessária

## Estrutura

```
kanban-app/
├── package.json
└── src/
    ├── main.js        ← Processo principal Electron
    ├── preload.js     ← Bridge segura Node ↔ Renderer
    ├── index.html     ← Interface principal
    ├── app.js         ← Lógica da aplicação
    └── styles/
        └── main.css   ← Estilos
```

## Dados

Os dados são salvos em JSON na pasta de dados do usuário:
- Windows: `%APPDATA%/kanban-flow/kanban-data.json`
- macOS: `~/Library/Application Support/kanban-flow/kanban-data.json`
- Linux: `~/.config/kanban-flow/kanban-data.json`
