const DB_NAME = "FlowERPDatabase";
const DB_VERSION = 5;
const stores = [
  "users",
  "companies",
  "preRegistrations",
  "clients",
  "employees",
  "financial",
  "sales",
  "inventory",
  "tasks",
  "documents",
  "employeeFiles",
  "documentFolders",
  "invoices",
  "digitalSignatures",
  "timeEntries",
  "timesheetSignatures",
  "medicalCertificates",
  "hrMessages",
  "permissions",
  "logs",
  "consents",
  "privacyRequests"
];

const sessionKey = "flow.erp.session";
const employeeSessionKey = "flow.erp.employeeSession";
const themeKey = "flow.erp.theme";
let dbPromise;
let appState = {
  currentUser: null,
  currentCompany: null,
  currentModule: "dashboard",
  currentEmployee: null,
  attendanceEmployeeId: "",
  attendanceMonth: new Date().toISOString().slice(0, 7),
  attendanceSelectedDate: new Date().toISOString().slice(0, 10)
};
const chartState = {};

const moduleInfo = {
  dashboard: { title: "Tenha uma excelente gestão hoje." },
  financial: { title: "Financeiro" },
  sales: { title: "Vendas" },
  clients: { title: "Clientes" },
  employees: { title: "Funcionários" },
  attendance: { title: "Ponto Eletronico" },
  inventory: { title: "Estoque" },
  reports: { title: "Relatórios" },
  settings: { title: "Configurações da empresa" }
};

const policies = {
  privacy: {
    title: "Política de Privacidade",
    body: `
      <p>A Flow ERP utiliza dados pessoais informados nos formulários para contato comercial, criação de conta, suporte à implantação e evolução da experiência de plataforma.</p>
      <p>Esta interface registra consentimento, data e hora, finalidade declarada e origem do envio em banco local IndexedDB para demonstrar a estrutura que pode ser conectada a uma API real.</p>
    `
  },
  terms: {
    title: "Termos de Uso",
    body: `
      <p>Este ambiente demonstra o funcionamento inicial da Flow ERP. A utilização definitiva da plataforma depende de backend, contrato, implantação, perfis de acesso e políticas operacionais da empresa contratante.</p>
      <p>As áreas de autenticação, permissões, sessão e recuperação de senha estão preparadas para integração futura com serviços de identidade.</p>
    `
  },
  cookies: {
    title: "Política de Cookies",
    body: `
      <p>A experiência prevê gerenciamento de cookies para preferências, métricas operacionais e recursos necessários de sessão. Nenhum cookie de publicidade é ativado por este protótipo.</p>
      <p>O gerenciamento poderá ser conectado a uma central de preferências antes da entrada em produção.</p>
    `
  },
  central: {
    title: "Central de Privacidade",
    body: `
      <p>A estrutura da Central de Privacidade contempla consentimento, revogação, solicitação de acesso, correção cadastral, exclusão de dados, gerenciamento de cookies e registro da finalidade do tratamento.</p>
      <ul>
        <li>Finalidade: pré-cadastro, criação de conta e contato sobre a plataforma Flow ERP.</li>
        <li>Registro: data, hora, texto aceito e origem do consentimento.</li>
        <li>Solicitações: acesso, alteração, revogação ou exclusão ficam salvas no banco local para atendimento posterior.</li>
      </ul>
    `
  }
};

const validators = {
  required(value) {
    return String(value || "").trim().length > 0;
  },
  email(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  },
  phone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 11;
  },
  cpf(value) {
    const cpf = String(value || "").replace(/\D/g, "");
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    const calc = (base) => {
      const sum = base.split("").reduce((acc, digit, index) => acc + Number(digit) * (base.length + 1 - index), 0);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return cpf.endsWith(`${calc(cpf.slice(0, 9))}${calc(cpf.slice(0, 10))}`);
  },
  password(value) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(String(value || ""));
  },
  cnpj(value) {
    const cnpj = String(value || "").replace(/\D/g, "");
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
    const calc = (base) => {
      const weights = base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = base.split("").reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    };
    return cnpj.endsWith(`${calc(cnpj.slice(0, 12))}${calc(cnpj.slice(0, 13))}`);
  }
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      stores.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      });
    };
    request.onblocked = () => {
      toast("Atualização do banco local bloqueada. Feche outras abas antigas do Flow ERP e recarregue.");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        toast("Nova versão carregada. Recarregando o Flow ERP.");
        setTimeout(() => window.location.reload(), 900);
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

const repository = {
  async all(storeName) {
    const db = await openDatabase();
    return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
  },
  async get(storeName, id) {
    const db = await openDatabase();
    return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).get(id));
  },
  async add(storeName, record) {
    const db = await openDatabase();
    const value = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...record
    };
    await requestToPromise(db.transaction(storeName, "readwrite").objectStore(storeName).add(value));
    return value;
  },
  async put(storeName, record) {
    const db = await openDatabase();
    const value = { ...record, updatedAt: new Date().toISOString() };
    await requestToPromise(db.transaction(storeName, "readwrite").objectStore(storeName).put(value));
    return value;
  },
  async remove(storeName, id) {
    const db = await openDatabase();
    await requestToPromise(db.transaction(storeName, "readwrite").objectStore(storeName).delete(id));
  },
  async findBy(storeName, field, value) {
    const records = await this.all(storeName);
    return records.find((record) => record[field] === value);
  }
};

function money(value) {
  return brl.format(Number(value || 0));
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function collectForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function markValidity(form, errors) {
  form.querySelectorAll("input, select, textarea").forEach((field) => {
    field.classList.toggle("invalid", errors.includes(field.name));
  });
}

function showMessage(formName, message, type) {
  const target = document.querySelector(`[data-form-message="${formName}"]`);
  if (!target) return;
  target.textContent = message;
  target.className = `form-message ${type}`;
}

function moduleMessage(message, type = "success") {
  const target = document.querySelector("[data-module-message]");
  if (target) {
    target.textContent = message;
    target.className = `module-message ${type}`;
  }
}

function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function syncBrandLogo() {
  const logo = document.querySelector(".brand img");
  if (!logo) return;
  logo.src = currentTheme() === "dark" ? "assets/flow-logo-branco.png" : "assets/flow-logo.png";
}

function syncThemeControls() {
  const isDark = currentTheme() === "dark";
  syncBrandLogo();
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const label = isDark ? "Ativar modo claro" : "Ativar modo escuro";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.innerHTML = `<i data-lucide="${isDark ? "sun" : "moon"}"></i>`;
  });
  initIcons();
}

function applyTheme(theme, persist = true) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  if (persist) localStorage.setItem(themeKey, normalized);
  syncThemeControls();
  redrawCharts();
}

function toggleTheme() {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
}

async function hashPassword(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureDemoData(companyId) {
  const [clients, employees, financial, sales, inventory, tasks, documents, documentFolders] = await Promise.all([
    repository.all("clients"),
    repository.all("employees"),
    repository.all("financial"),
    repository.all("sales"),
    repository.all("inventory"),
    repository.all("tasks"),
    repository.all("documents"),
    repository.all("documentFolders")
  ]);
  if (!documentFolders.some((record) => record.companyId === companyId)) {
    await Promise.all([
      repository.add("documentFolders", { companyId, name: "Geral" }),
      repository.add("documentFolders", { companyId, name: "Contratos" }),
      repository.add("documentFolders", { companyId, name: "Faturas" })
    ]);
  }
  const hasAny = [clients, employees, financial, sales, inventory, tasks, documents]
    .some((records) => records.some((record) => record.companyId === companyId));
  if (hasAny) return;

  await Promise.all([
    repository.add("clients", { companyId, name: "Cliente Modelo", email: "compras@clientemodelo.com.br", phone: "11988887777", city: "São Paulo", status: "Ativo" }),
    repository.add("employees", { companyId, name: "Ana Ribeiro", cpf: "52998224725", phone: "11988886666", department: "Financeiro", role: "Analista", email: "ana@empresa.com.br", admissionDate: "2026-01-10", status: "Ativo", accessUsername: "52998224725", accessPasswordHash: await hashPassword("1234"), mustChangePassword: true }),
    repository.add("financial", { companyId, type: "Receita", description: "Contrato ERP mensal", category: "Assinatura", amount: 428320, dueDate: "2026-08-27", status: "Recebido" }),
    repository.add("financial", { companyId, type: "Despesa", description: "Operação e equipe", category: "Administrativo", amount: 156980, dueDate: "2026-08-27", status: "Pago" }),
    repository.add("sales", { companyId, client: "Cliente Modelo", opportunity: "Implantação ERP", value: 84000, stage: "Proposta", owner: "Marina" }),
    repository.add("inventory", { companyId, sku: "FLOW-SRV", product: "Serviço de implantação", quantity: 80, minQuantity: 15, location: "Operações" }),
    repository.add("tasks", { companyId, title: "Revisar fechamento financeiro", owner: "Marina", dueDate: "2026-08-29", priority: "Alta", status: "Pendente" }),
    repository.add("documents", { companyId, name: "Contrato de implantação", type: "Contrato", owner: "Jurídico", status: "Em revisão", reference: "DOC-001" })
  ]);
}

async function ensureEmployeeAccessCredentials(companyId) {
  const employees = (await repository.all("employees")).filter((employee) => employee.companyId === companyId);
  await Promise.all(employees.map(async (employee) => {
    const cpf = digitsOnly(employee.cpf);
    if (!cpf || employee.accessPasswordHash) return;
    await repository.put("employees", {
      ...employee,
      cpf,
      accessUsername: cpf,
      accessPasswordHash: await hashPassword("1234"),
      mustChangePassword: true
    });
  }));
}

async function getContext() {
  const session = JSON.parse(localStorage.getItem(sessionKey) || "null");
  if (session?.userId && session?.companyId) {
    const [user, company] = await Promise.all([
      repository.get("users", session.userId),
      repository.get("companies", session.companyId)
    ]);
    if (user && company) {
      appState.currentUser = user;
      appState.currentCompany = company;
      await ensureDemoData(company.id);
      await ensureEmployeeAccessCredentials(company.id);
      return appState;
    }
  }

  const existingCompany = (await repository.all("companies"))[0];
  const company = existingCompany || await repository.add("companies", {
    name: "Empresa Demonstração",
    tradeName: "Flow Demo",
    cnpj: "11222333000181",
    email: "contato@empresa.com.br",
    phone: "11987654321",
    segment: "Tecnologia",
    employeesRange: "11 a 50",
    city: "São Paulo",
    state: "SP",
    address: "Avenida Paulista, 1000",
    responsible: "Marina Costa",
    responsibleRole: "Diretora"
  });
  const users = await repository.all("users");
  const user = users.find((item) => item.companyId === company.id) || await repository.add("users", {
    fullName: "Marina Costa",
    email: "marina@empresa.com.br",
    phone: "11987654321",
    companyId: company.id,
    passwordHash: await hashPassword("Flowerp1"),
    permissionProfile: "admin"
  });
  localStorage.setItem(sessionKey, JSON.stringify({ userId: user.id, companyId: company.id }));
  appState.currentUser = user;
  appState.currentCompany = company;
  await ensureDemoData(company.id);
  await ensureEmployeeAccessCredentials(company.id);
  return appState;
}

function companyFilter(records) {
  return records.filter((record) => record.companyId === appState.currentCompany?.id);
}

async function dashboardData() {
  const [clients, employees, financial, tasks, inventory, sales, docs, consents, employeeFiles, documentFolders, invoices, timeEntries, timesheetSignatures, medicalCertificates, hrMessages] = await Promise.all([
    repository.all("clients"),
    repository.all("employees"),
    repository.all("financial"),
    repository.all("tasks"),
    repository.all("inventory"),
    repository.all("sales"),
    repository.all("documents"),
    repository.all("consents"),
    repository.all("employeeFiles"),
    repository.all("documentFolders"),
    repository.all("invoices"),
    repository.all("timeEntries"),
    repository.all("timesheetSignatures"),
    repository.all("medicalCertificates"),
    repository.all("hrMessages")
  ]);
  const scopedFinancial = companyFilter(financial);
  const revenue = scopedFinancial.filter((item) => item.type === "Receita").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenses = scopedFinancial.filter((item) => item.type === "Despesa").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    clients: companyFilter(clients),
    employees: companyFilter(employees),
    financial: scopedFinancial,
    tasks: companyFilter(tasks),
    inventory: companyFilter(inventory),
    sales: companyFilter(sales),
    documents: companyFilter(docs),
    consents: companyFilter(consents),
    employeeFiles: companyFilter(employeeFiles),
    documentFolders: companyFilter(documentFolders),
    invoices: companyFilter(invoices),
    timeEntries: companyFilter(timeEntries),
    timesheetSignatures: companyFilter(timesheetSignatures),
    medicalCertificates: companyFilter(medicalCertificates),
    hrMessages: companyFilter(hrMessages),
    revenue,
    expenses,
    profit: revenue - expenses
  };
}

function setTopbar() {
  document.querySelector("[data-user-name]").textContent = (appState.currentUser?.fullName || "Usuário").split(" ")[0];
  document.querySelector("[data-module-title]").textContent = moduleInfo[appState.currentModule]?.title || "Flow ERP";
}

async function renderKpis() {
  const data = await dashboardData();
  const kpis = document.querySelector("[data-dashboard-kpis]");
  if (!kpis) return;
  kpis.innerHTML = `
    <article><span>Faturamento</span><strong>${money(data.revenue)}</strong><small>${data.financial.length} lançamentos</small></article>
    <article><span>Despesas</span><strong>${money(data.expenses)}</strong><small>controle operacional</small></article>
    <article><span>Lucro</span><strong>${money(data.profit)}</strong><small>receita - despesa</small></article>
    <article><span>Clientes ativos</span><strong>${number.format(data.clients.length)}</strong><small>base comercial</small></article>
    <article><span>Funcionários</span><strong>${number.format(data.employees.length)}</strong><small>equipe cadastrada</small></article>
  `;
}

function toggleDashboardKpis(visible) {
  const kpis = document.querySelector("[data-dashboard-kpis]");
  if (!kpis) return;
  kpis.hidden = !visible;
  kpis.setAttribute("aria-hidden", String(!visible));
}

function statusClass(value) {
  if (["Pendente", "Em negociação", "Em revisão", "Baixo estoque", "Atrasado"].includes(value)) return "warn";
  if (["Proposta", "Em andamento", "Contato feito", "Em implantação"].includes(value)) return "info";
  return "";
}

function emptyState(text) {
  return `<div class="empty-state"><div><p>${text}</p></div></div>`;
}

function table(records, columns, storeName) {
  if (!records.length) return emptyState("Nenhum registro salvo ainda. Preencha o formulário ao lado para gravar no banco local.");
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${columns.map((col) => `<th>${col.label}</th>`).join("")}<th>Ações</th></tr></thead>
        <tbody>
          ${records.map((record) => `
            <tr>
              ${columns.map((col) => `<td>${col.format ? col.format(record[col.key], record) : escapeHtml(record[col.key])}</td>`).join("")}
              <td><div class="row-actions"><button class="mini-button danger" type="button" data-delete="${storeName}" data-id="${record.id}">Excluir</button></div></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formField(label, name, type = "text", value = "", attrs = "") {
  return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}></label>`;
}

function selectField(label, name, options, value = "") {
  return `
    <label>${label}
      <select name="${name}" required>
        <option value="">Selecione</option>
        ${options.map((option) => `<option ${option === value ? "selected" : ""}>${option}</option>`).join("")}
      </select>
    </label>
  `;
}

function fileField(label, name, multiple = false) {
  return `<label>${label}<input name="${name}" type="file" ${multiple ? "multiple" : ""}></label>`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      dataUrl: reader.result
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function filesFromInput(input) {
  if (!input?.files?.length) return [];
  return Promise.all([...input.files].map(readFileAsDataUrl));
}

function fileActions(file) {
  return `
    <div class="row-actions">
      <button class="mini-button" type="button" data-preview-file="${file.id}">Ver</button>
      <button class="mini-button" type="button" data-download-file="${file.id}">Baixar</button>
      <button class="mini-button danger" type="button" data-delete-file="${file.storeName}" data-id="${file.id}">Excluir</button>
    </div>
  `;
}

function dashboardModule(data) {
  const pendingTasks = data.tasks.filter((task) => task.status !== "Concluída").slice(0, 4);
  return `
    <div class="erp-chart">
      <div class="panel-head"><span>Resultado operacional</span><small>dados do banco local</small></div>
      <canvas id="erpChart" width="780" height="300" aria-label="Gráfico interativo de resultado operacional"></canvas>
      <div class="dashboard-actions">
        <button class="quick-action" type="button" data-module-shortcut="financial">Novo financeiro</button>
        <button class="quick-action" type="button" data-module-shortcut="clients">Novo cliente</button>
        <button class="quick-action" type="button" data-module-shortcut="tasks">Nova tarefa</button>
        <button class="quick-action" type="button" data-module-shortcut="settings">Minha empresa</button>
      </div>
    </div>
    <aside class="erp-side-panel">
      <h2>Rotina do dia</h2>
      ${pendingTasks.length ? pendingTasks.map((task) => `<p><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.status)}</span></p>`).join("") : "<p><strong>Nenhuma tarefa pendente</strong><span>Operação em dia</span></p>"}
      <p><strong>Oportunidades</strong><span>${data.sales.length} no CRM</span></p>
      <button class="secondary-button full" type="button" data-logout>Sair do demo</button>
    </aside>
  `;
}

function financialModule(records) {
  return `
    <div class="module-grid">
      <section class="module-panel">
        <h2>Novo lançamento</h2>
        <p>Receitas e despesas salvas aqui alimentam automaticamente o dashboard e os relatórios.</p>
        <form class="module-form" data-module-form="financial" novalidate>
          <div class="form-grid">
            ${selectField("Tipo", "type", ["Receita", "Despesa"])}
            ${formField("Valor", "amount", "number", "", "min='0' step='0.01' required")}
            ${formField("Descrição", "description", "text", "", "required")}
            ${formField("Categoria", "category", "text", "", "required")}
            ${formField("Vencimento", "dueDate", "date", "", "required")}
            ${selectField("Status", "status", ["Aberto", "Recebido", "Pago", "Atrasado"])}
          </div>
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Salvar lançamento</button>
        </form>
      </section>
      <section class="data-panel">
        <h2>Lançamentos financeiros</h2>
        ${table(records, [
          { label: "Tipo", key: "type" },
          { label: "Descrição", key: "description" },
          { label: "Categoria", key: "category" },
          { label: "Valor", key: "amount", format: (value) => money(value) },
          { label: "Status", key: "status", format: (value) => `<span class="status-pill ${statusClass(value)}">${escapeHtml(value)}</span>` }
        ], "financial")}
      </section>
    </div>
  `;
}

function salesModule(records) {
  return `
    <div class="module-grid">
      <section class="module-panel">
        <h2>Nova oportunidade</h2>
        <p>Registre negociações, responsáveis e valores para acompanhar o pipeline comercial.</p>
        <form class="module-form" data-module-form="sales" novalidate>
          ${formField("Cliente", "client", "text", "", "required")}
          ${formField("Oportunidade", "opportunity", "text", "", "required")}
          <div class="form-grid">
            ${formField("Valor estimado", "value", "number", "", "min='0' step='0.01' required")}
            ${selectField("Etapa", "stage", ["Contato feito", "Proposta", "Em negociação", "Ganho", "Perdido"])}
          </div>
          ${formField("Responsável", "owner", "text", appState.currentUser?.fullName || "", "required")}
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Salvar oportunidade</button>
        </form>
      </section>
      <section class="data-panel">
        <h2>Pipeline de vendas</h2>
        ${table(records, [
          { label: "Cliente", key: "client" },
          { label: "Oportunidade", key: "opportunity" },
          { label: "Valor", key: "value", format: (value) => money(value) },
          { label: "Etapa", key: "stage", format: (value) => `<span class="status-pill ${statusClass(value)}">${escapeHtml(value)}</span>` },
          { label: "Responsável", key: "owner" }
        ], "sales")}
      </section>
    </div>
  `;
}

function clientsModule(records) {
  return `
    <div class="module-grid">
      <section class="module-panel">
        <h2>Novo cliente</h2>
        <p>Cadastre clientes para conectar vendas, financeiro, e atendimento.</p>
        <form class="module-form" data-module-form="clients" novalidate>
          ${formField("Nome/Razão social", "name", "text", "", "required")}
          ${formField("E-mail", "email", "email", "", "required")}
          <div class="form-grid">
            ${formField("Telefone", "phone", "tel", "", "required")}
            ${formField("Cidade", "city", "text", "", "required")}
          </div>
          ${selectField("Status", "status", ["Ativo", "Em implantação", "Inativo"])}
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Salvar cliente</button>
        </form>
      </section>
      <section class="data-panel">
        <h2>Clientes cadastrados</h2>
        ${table(records, [
          { label: "Cliente", key: "name" },
          { label: "E-mail", key: "email" },
          { label: "Telefone", key: "phone" },
          { label: "Cidade", key: "city" },
          { label: "Status", key: "status", format: (value) => `<span class="status-pill ${statusClass(value)}">${escapeHtml(value)}</span>` }
        ], "clients")}
      </section>
    </div>
  `;
}

function employeesModule(records, files, medicalCertificates, hrMessages) {
  const fileRows = files.map((file) => ({
    ...file,
    storeName: "employeeFiles",
    employeeName: records.find((employee) => employee.id === file.employeeId)?.name || "Funcionário"
  }));
  const certificateRows = medicalCertificates.map((file) => ({
    ...file,
    storeName: "medicalCertificates",
    employeeName: records.find((employee) => employee.id === file.employeeId)?.name || "Funcionário"
  }));
  const messages = hrMessages
    .map((message) => ({
      ...message,
      employeeName: records.find((employee) => employee.id === message.employeeId)?.name || "Funcionário"
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return `
    <div class="module-grid">
      <section class="module-panel">
        <h2>Cadastro de funcionário</h2>
        <p>Organize dados do colaborador, vínculo, documentos e desligamento em uma única área.</p>
        <form class="module-form" data-module-form="employees" enctype="multipart/form-data" novalidate>
          ${formField("Nome completo", "name", "text", "", "required")}
          <div class="form-grid">
            ${formField("CPF", "cpf", "text", "", "required")}
            ${formField("Documento profissional", "professionalDocument", "text", "")}
            ${formField("Matricula", "registrationNumber", "text", "")}
            ${formField("E-mail", "email", "email", "", "required")}
            ${formField("Telefone", "phone", "tel", "")}
            ${formField("Departamento", "department", "text", "", "required")}
            ${formField("Cargo", "role", "text", "", "required")}
            ${formField("Jornada de trabalho", "workSchedule", "text", "08:00 as 18:00")}
            ${formField("Salário", "salary", "number", "", "min='0' step='0.01'")}
            ${formField("Data de admissão", "admissionDate", "date", "", "required")}
            ${formField("Data de demissão", "terminationDate", "date", "")}
          </div>
          ${selectField("Status", "status", ["Ativo", "Férias", "Afastado", "Desligado"], "Ativo")}
          ${fileField("Anexar documentos do funcionário", "employeeDocuments", true)}
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Salvar funcionário</button>
        </form>
      </section>
      <section class="data-panel">
        <h2>Equipe</h2>
        ${records.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Nome</th><th>CPF</th><th>Cargo</th><th>Admissão</th><th>Demissão</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                ${records.map((employee) => `
                  <tr>
                    <td>${escapeHtml(employee.name)}</td>
                    <td>${escapeHtml(employee.cpf || "")}</td>
                    <td>${escapeHtml(employee.role || "")}</td>
                    <td>${escapeHtml(employee.admissionDate || "")}</td>
                    <td>${escapeHtml(employee.terminationDate || "")}</td>
                    <td><span class="status-pill ${statusClass(employee.status)}">${escapeHtml(employee.status)}</span></td>
                    <td>
                      <div class="row-actions">
                        <button class="mini-button" type="button" data-terminate-employee="${employee.id}">Desligar</button>
                        <button class="mini-button danger" type="button" data-delete="employees" data-id="${employee.id}">Excluir</button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState("Nenhum funcionário cadastrado ainda.")}
        <h2 class="subsection-title">Documentos dos funcionários</h2>
        ${fileRows.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Funcionário</th><th>Arquivo</th><th>Tipo</th><th>Tamanho</th><th>Ações</th></tr></thead>
              <tbody>
                ${fileRows.map((file) => `
                  <tr>
                    <td>${escapeHtml(file.employeeName)}</td>
                    <td>${escapeHtml(file.fileName)}</td>
                    <td>${escapeHtml(file.mimeType)}</td>
                    <td>${number.format(Math.round(Number(file.size || 0) / 1024))} KB</td>
                    <td>${fileActions(file)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState("Anexe documentos no cadastro do funcionário para consultar e baixar depois.")}
        <h2 class="subsection-title">Atestados médicos</h2>
        ${certificateRows.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Funcionário</th><th>Arquivo</th><th>Data</th><th>Ações</th></tr></thead>
              <tbody>
                ${certificateRows.map((file) => `
                  <tr>
                    <td>${escapeHtml(file.employeeName)}</td>
                    <td>${escapeHtml(file.fileName)}</td>
                    <td>${new Date(file.createdAt).toLocaleString("pt-BR")}</td>
                    <td>${fileActions(file)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState("Os atestados enviados pelo funcionário aparecerão aqui.")}
        <h2 class="subsection-title">Chat com funcionários</h2>
        <form class="module-form compact-form" data-module-form="hrMessage" novalidate>
          <div class="form-grid">
            <label>Funcionário
              <select name="employeeId" required>
                <option value="">Selecione</option>
                ${records.map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)} - ${escapeHtml(employee.cpf || "")}</option>`).join("")}
              </select>
            </label>
            ${formField("Assunto", "subject", "text", "Mensagem do RH", "required")}
          </div>
          <label>Mensagem<textarea name="message" required></textarea></label>
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Enviar mensagem ao funcionário</button>
        </form>
        <div class="chat-list">
          ${messages.length ? messages.map((message) => `
            <article class="chat-card ${message.direction === "employee" ? "from-employee" : "from-hr"}">
              <strong>${message.direction === "employee" ? escapeHtml(message.employeeName) : "RH"} para ${message.direction === "employee" ? "RH" : escapeHtml(message.employeeName)}</strong>
              <span>${new Date(message.createdAt).toLocaleString("pt-BR")}</span>
              <p>${escapeHtml(message.message)}</p>
            </article>
          `).join("") : emptyState("Nenhuma conversa aberta ainda.")}
        </div>
      </section>
    </div>
  `;
}

function pointTypeConfig() {
  return [
    { key: "entry", label: "Entrada" },
    { key: "lunchOut", label: "Saida do almoco" },
    { key: "lunchReturn", label: "Retorno do almoco" },
    { key: "exit", label: "Saida" }
  ];
}

function monthRange(month) {
  const [year, rawMonth] = String(month || new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const safeYear = year || new Date().getFullYear();
  const safeMonth = rawMonth || new Date().getMonth() + 1;
  const last = new Date(safeYear, safeMonth, 0).getDate();
  return {
    start: `${safeYear}-${String(safeMonth).padStart(2, "0")}-01`,
    end: `${safeYear}-${String(safeMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
    year: safeYear,
    monthIndex: safeMonth - 1,
    days: last
  };
}

function eachDate(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function dateBr(date) {
  if (!date) return "";
  const [year, month, day] = String(date).split("-");
  return `${day}/${month}/${year}`;
}

function monthLabel(month) {
  const range = monthRange(month);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(range.year, range.monthIndex, 1));
}

function entriesByType(entries) {
  return Object.fromEntries(pointTypeConfig().map((type) => [
    type.key,
    entries.find((entry) => entry.type === type.label)
  ]));
}

function attendanceModule(employees, timeEntries, signatures) {
  const selectedEmployee = employees.find((employee) => employee.id === appState.attendanceEmployeeId) || employees[0];
  const month = appState.attendanceMonth || new Date().toISOString().slice(0, 7);
  const range = monthRange(month);
  const selectedDate = appState.attendanceSelectedDate?.startsWith(month) ? appState.attendanceSelectedDate : range.start;
  appState.attendanceEmployeeId = selectedEmployee?.id || "";
  appState.attendanceSelectedDate = selectedDate;

  if (!employees.length) {
    return `
      <section class="report-panel">
        <h2>Ponto Eletronico</h2>
        ${emptyState("Cadastre um funcionario antes de controlar o ponto eletronico.")}
      </section>
    `;
  }

  const employeeEntries = timeEntries
    .filter((entry) => entry.employeeId === selectedEmployee.id)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const dayEntries = employeeEntries.filter((entry) => entry.date === selectedDate);
  const dayMap = entriesByType(dayEntries);
  const datesWithEntries = new Set(employeeEntries.map((entry) => entry.date));
  const monthSignatures = signatures
    .filter((signature) => signature.employeeId === selectedEmployee.id)
    .sort((a, b) => new Date(b.signedAt || b.createdAt) - new Date(a.signedAt || a.createdAt));
  const firstOffset = new Date(range.year, range.monthIndex, 1).getDay();
  const calendarCells = [
    ...Array.from({ length: firstOffset }, (_, index) => `<span class="calendar-empty" aria-hidden="true" data-offset="${index}"></span>`),
    ...Array.from({ length: range.days }, (_, index) => {
      const day = index + 1;
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const classes = ["calendar-day"];
      if (date === selectedDate) classes.push("selected");
      if (datesWithEntries.has(date)) classes.push("has-entry");
      return `<button class="${classes.join(" ")}" type="button" data-attendance-date="${date}"><strong>${day}</strong><span>${datesWithEntries.has(date) ? "Com ponto" : "Sem ponto"}</span></button>`;
    })
  ].join("");

  return `
    <div class="attendance-layout">
      <section class="module-panel attendance-control">
        <div class="panel-head">
          <div>
            <h2>Ponto Eletronico</h2>
            <p>Selecione o funcionario, escolha o mes e abra o dia para corrigir ou incluir batidas.</p>
          </div>
        </div>
        <div class="form-grid attendance-filters">
          <label>Funcionario
            <select data-attendance-employee>
              ${employees.map((employee) => `<option value="${employee.id}" ${employee.id === selectedEmployee.id ? "selected" : ""}>${escapeHtml(employee.name)} - ${escapeHtml(employee.cpf || "")}</option>`).join("")}
            </select>
          </label>
          ${formField("Mes", "attendanceMonth", "month", month, "data-attendance-month")}
        </div>
        <div class="attendance-calendar" aria-label="Calendario de ponto">
          ${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}
          ${calendarCells}
        </div>
      </section>

      <section class="data-panel attendance-detail">
        <h2>${escapeHtml(selectedEmployee.name)} - ${dateBr(selectedDate)}</h2>
        <p>Edite os horarios existentes ou preencha os campos vazios para criar batidas que nao foram registradas.</p>
        <form class="module-form" data-module-form="attendanceDay" novalidate>
          <input type="hidden" name="employeeId" value="${selectedEmployee.id}">
          <input type="hidden" name="date" value="${selectedDate}">
          <div class="attendance-edit-list">
            ${pointTypeConfig().map((type) => {
              const entry = dayMap[type.key];
              return `
                <div class="attendance-edit-row">
                  <strong>${type.label}</strong>
                  <input type="time" name="${type.key}Time" value="${escapeHtml(entry?.time || "")}">
                  <input type="text" name="${type.key}Address" value="${escapeHtml(entry?.address || entry?.mapLabel || "Ajuste manual pelo RH")}" placeholder="Endereco ou observacao">
                </div>
              `;
            }).join("")}
          </div>
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Salvar ponto do dia</button>
        </form>

        <h2 class="subsection-title">Baixar espelho de ponto</h2>
        <form class="module-form compact-form" data-module-form="attendanceReport" novalidate>
          <input type="hidden" name="employeeId" value="${selectedEmployee.id}">
          <div class="form-grid">
            ${formField("De", "startDate", "date", range.start, "required")}
            ${formField("Ate", "endDate", "date", range.end, "required")}
          </div>
          <button class="secondary-button full" type="submit">Baixar espelho de ponto</button>
        </form>

        <h2 class="subsection-title">Espelhos assinados</h2>
        ${monthSignatures.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Periodo</th><th>Assinado em</th><th>Status</th><th>Acoes</th></tr></thead>
              <tbody>
                ${monthSignatures.map((signature) => `
                  <tr>
                    <td>${dateBr(signature.periodStart)} ate ${dateBr(signature.periodEnd)}</td>
                    <td>${new Date(signature.signedAt || signature.createdAt).toLocaleString("pt-BR")}</td>
                    <td><span class="status-pill">Assinado</span></td>
                    <td><button class="mini-button" type="button" data-download-signed-timesheet="${signature.id}">Baixar assinado</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState("Quando o funcionario assinar o espelho do mes, o registro aparecera aqui para baixar pela empresa.")}
      </section>
    </div>
  `;
}

function inventoryModule(records) {
  return `
    <div class="module-grid">
      <section class="module-panel">
        <h2>Novo item de estoque</h2>
        <p>Controle produtos, quantidades mínimas e localização operacional.</p>
        <form class="module-form" data-module-form="inventory" novalidate>
          <div class="form-grid">
            ${formField("SKU", "sku", "text", "", "required")}
            ${formField("Produto", "product", "text", "", "required")}
            ${formField("Quantidade", "quantity", "number", "", "min='0' required")}
            ${formField("Estoque mínimo", "minQuantity", "number", "", "min='0' required")}
          </div>
          ${formField("Localização", "location", "text", "", "required")}
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Salvar item</button>
        </form>
      </section>
      <section class="data-panel">
        <h2>Produtos e movimentações</h2>
        ${table(records.map((item) => ({ ...item, stockStatus: Number(item.quantity) <= Number(item.minQuantity) ? "Baixo estoque" : "Disponível" })), [
          { label: "SKU", key: "sku" },
          { label: "Produto", key: "product" },
          { label: "Quantidade", key: "quantity" },
          { label: "Mínimo", key: "minQuantity" },
          { label: "Status", key: "stockStatus", format: (value) => `<span class="status-pill ${statusClass(value)}">${escapeHtml(value)}</span>` }
        ], "inventory")}
      </section>
    </div>
  `;
}

function tasksModule(records) {
  return `
    <div class="module-grid">
      <section class="module-panel">
        <h2>Nova tarefa</h2>
        <p>Crie atividades com prioridade, prazo e responsável para acompanhar a execução.</p>
        <form class="module-form" data-module-form="tasks" novalidate>
          ${formField("Título", "title", "text", "", "required")}
          <div class="form-grid">
            ${formField("Responsável", "owner", "text", appState.currentUser?.fullName || "", "required")}
            ${formField("Prazo", "dueDate", "date", "", "required")}
            ${selectField("Prioridade", "priority", ["Baixa", "Média", "Alta"])}
            ${selectField("Status", "status", ["Pendente", "Em andamento", "Concluída"])}
          </div>
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Salvar tarefa</button>
        </form>
      </section>

    </div>
  `;
}

function documentsModule(records, folders) {
  const folderOptions = folders.length ? folders.map((folder) => ({ label: folder.name, value: folder.id })) : [{ label: "Geral", value: "general" }];
  const folderName = (folderId) => folders.find((folder) => folder.id === folderId)?.name || "Geral";
  const recordsWithStore = records.map((record) => ({ ...record, storeName: "documents" }));
  return `
    <div class="module-grid">
      <section class="module-panel">
        <h2>Nova pasta</h2>
        <p>Crie subpastas para organizar contratos, faturas, políticas internas e outros arquivos.</p>
        <form class="module-form compact-form" data-module-form="documentFolders" novalidate>
          ${formField("Nome da pasta", "name", "text", "", "required")}
          <button class="secondary-button full" type="submit">Criar pasta</button>
        </form>

        <h2>Novo documento</h2>
        <p>Suba arquivos para a pasta desejada. Depois você pode abrir no navegador ou baixar novamente.</p>
        <form class="module-form" data-module-form="documents" enctype="multipart/form-data" novalidate>
          ${formField("Nome do documento", "name", "text", "", "required")}
          <div class="form-grid">
            <label>Pasta
              <select name="folderId" required>
                ${folderOptions.map((folder) => `<option value="${folder.value}">${escapeHtml(folder.label)}</option>`).join("")}
              </select>
            </label>
            ${selectField("Tipo", "type", ["Contrato", "Fatura", "Nota fiscal", "Relatório", "Política interna", "Documento RH", "Outros"])}
            ${formField("Responsável", "owner", "text", "", "required")}
            ${selectField("Status", "status", ["Ativo", "Em revisão", "Arquivado"])}
          </div>
          ${fileField("Anexar arquivo", "documentFile", false)}
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Salvar documento</button>
        </form>
      </section>
      <section class="data-panel">
        <h2>Biblioteca documental</h2>
        <div class="folder-grid">
          ${folders.length ? folders.map((folder) => `
            <article class="folder-card">
              <strong>${escapeHtml(folder.name)}</strong>
              <span>${records.filter((record) => record.folderId === folder.id).length} documentos</span>
            </article>
          `).join("") : `<article class="folder-card"><strong>Geral</strong><span>Pasta padrão</span></article>`}
        </div>
        ${recordsWithStore.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Pasta</th><th>Documento</th><th>Tipo</th><th>Arquivo</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                ${recordsWithStore.map((record) => `
                  <tr>
                    <td>${escapeHtml(folderName(record.folderId))}</td>
                    <td>${escapeHtml(record.name)}</td>
                    <td>${escapeHtml(record.type)}</td>
                    <td>${escapeHtml(record.fileName || "Sem arquivo")}</td>
                    <td><span class="status-pill ${statusClass(record.status)}">${escapeHtml(record.status)}</span></td>
                    <td>${record.dataUrl ? fileActions(record) : `<div class="row-actions"><button class="mini-button danger" type="button" data-delete="documents" data-id="${record.id}">Excluir</button></div>`}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState("Crie uma pasta e suba documentos para consultar, visualizar e baixar quando precisar.")}
      </section>
    </div>
  `;
}

function invoiceItemRow(index) {
  return `
    <div class="invoice-item-row" data-invoice-item-row>
      ${formField("Descrição do item/serviço", "itemDescription", "text", "", "required")}
      ${formField("NCM/Código", "itemCode", "text", "")}
      ${formField("CFOP", "itemCfop", "text", "")}
      ${formField("Qtd.", "itemQuantity", "number", "1", "min='0' step='0.01' required")}
      ${selectField("Unid.", "itemUnit", ["UN", "CX", "KG", "LT", "SERV"], index === 0 ? "UN" : "")}
      ${formField("Valor unitário", "itemUnitValue", "number", "", "min='0' step='0.01' required")}
      ${formField("Desconto", "itemDiscount", "number", "0", "min='0' step='0.01'")}
      <button class="mini-button danger" type="button" data-remove-invoice-item>Remover</button>
    </div>
  `;
}

function invoicesModule(records) {
  const rows = records.map((record) => ({ ...record, storeName: "invoices" }));
  return `
    <div class="invoice-layout">
      <section class="module-panel">
        <h2>Emissor de Nota Fiscal</h2>
        <p>Preencha os dados para gerar uma nota fiscal demonstrativa com os dados e o logotipo cadastrados em Configurações.</p>
        <form class="module-form" data-module-form="invoices" enctype="multipart/form-data" novalidate>
          <div class="settings-block">
            <h3>Dados da emissão</h3>
            <div class="form-grid three">
              ${selectField("Modelo", "model", ["NF-e", "NFS-e", "NFC-e"], "NF-e")}
              ${formField("Número", "number", "text", "", "required")}
              ${formField("Série", "series", "text", "1", "required")}
              ${formField("Data de emissão", "issueDate", "date", new Date().toISOString().slice(0, 10), "required")}
              ${formField("Natureza da operação", "operationNature", "text", "Venda de mercadoria", "required")}
              ${selectField("Tipo de operação", "operationType", ["Saída", "Entrada"], "Saída")}
              ${formField("Chave de acesso demo", "accessKey", "text", "", "placeholder='Gerada automaticamente se ficar vazia'")}
              ${formField("Protocolo demo", "protocol", "text", "", "placeholder='Gerado automaticamente se ficar vazio'")}
              ${selectField("Finalidade", "purpose", ["Normal", "Complementar", "Ajuste", "Devolução"], "Normal")}
            </div>
          </div>

          <div class="settings-block">
            <h3>Destinatário</h3>
            <div class="form-grid three">
              ${formField("Nome/Razão social", "recipientName", "text", "", "required")}
              ${formField("CPF/CNPJ", "recipientDocument", "text", "", "required")}
              ${formField("Inscrição estadual", "recipientStateRegistration", "text", "")}
              ${formField("E-mail", "recipientEmail", "email", "", "required")}
              ${formField("Telefone", "recipientPhone", "tel", "")}
              ${formField("CEP", "recipientZip", "text", "")}
              ${formField("Endereço", "recipientAddress", "text", "", "required")}
              ${formField("Bairro", "recipientDistrict", "text", "")}
              ${formField("Cidade", "recipientCity", "text", "", "required")}
              ${selectField("Estado", "recipientState", ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"], "SP")}
            </div>
          </div>

          <div class="settings-block">
            <div class="panel-head">
              <h3>Itens da nota</h3>
              <button class="mini-button" type="button" data-add-invoice-item>Adicionar item</button>
            </div>
            <div class="invoice-items" data-invoice-items>${invoiceItemRow(0)}</div>
          </div>

          <div class="settings-block">
            <h3>Impostos, transporte e pagamento</h3>
            <div class="form-grid three">
              ${formField("Base ICMS", "icmsBase", "number", "0", "min='0' step='0.01'")}
              ${formField("Valor ICMS", "icmsValue", "number", "0", "min='0' step='0.01'")}
              ${formField("Valor IPI", "ipiValue", "number", "0", "min='0' step='0.01'")}
              ${formField("PIS", "pisValue", "number", "0", "min='0' step='0.01'")}
              ${formField("COFINS", "cofinsValue", "number", "0", "min='0' step='0.01'")}
              ${formField("ISS", "issValue", "number", "0", "min='0' step='0.01'")}
              ${formField("Frete", "freightValue", "number", "0", "min='0' step='0.01'")}
              ${formField("Transportadora", "carrier", "text", "")}
              ${selectField("Forma de pagamento", "paymentMethod", ["Pix", "Boleto", "Cartão", "Transferência", "Dinheiro", "Faturado"], "Pix")}
              ${selectField("Condição de pagamento", "paymentTerms", ["À vista", "7 dias", "15 dias", "30 dias", "Parcelado"], "À vista")}
              ${formField("Vencimento", "paymentDueDate", "date", "")}
            </div>
            <label>Informações complementares<textarea name="notes">Nota fiscal gerada em ambiente demonstrativo da Flow ERP, sem validade fiscal.</textarea></label>
          </div>

          <div class="settings-block">
            <h3>Assinatura digital da empresa</h3>
            <p>Insira o arquivo de assinatura/certificado para registrar a preparação da emissão. Este demo não transmite dados para SEFAZ ou prefeitura.</p>
            <div class="form-grid">
              ${formField("Responsável pela assinatura", "signatureResponsible", "text", appState.currentCompany?.responsible || appState.currentUser?.fullName || "", "required")}
              ${fileField("Arquivo da assinatura digital", "digitalSignature", false)}
            </div>
          </div>

          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Gerar nota fiscal demo</button>
        </form>
      </section>
      <section class="data-panel">
        ${rows.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Número</th><th>Modelo</th><th>Destinatário</th><th>Total</th><th>Emissão</th><th>Ações</th></tr></thead>
              <tbody>
                ${rows.map((record) => `
                  <tr>
                    <td>${escapeHtml(record.number)}/${escapeHtml(record.series)}</td>
                    <td>${escapeHtml(record.model)}</td>
                    <td>${escapeHtml(record.recipientName)}</td>
                    <td>${money(record.total)}</td>
                    <td>${escapeHtml(record.issueDate)}</td>
                    <td>${fileActions(record)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : emptyState("Nenhuma nota fiscal demo gerada ainda. Preencha o formulário para criar a primeira.")}
      </section>
    </div>
  `;
}

function invoiceAccessKey() {
  return Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join("");
}

function invoiceProtocol() {
  return `${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`;
}

function collectInvoiceItems(form) {
  const descriptions = new FormData(form).getAll("itemDescription");
  const codes = new FormData(form).getAll("itemCode");
  const cfops = new FormData(form).getAll("itemCfop");
  const quantities = new FormData(form).getAll("itemQuantity");
  const units = new FormData(form).getAll("itemUnit");
  const unitValues = new FormData(form).getAll("itemUnitValue");
  const discounts = new FormData(form).getAll("itemDiscount");
  return descriptions.map((description, index) => {
    const quantity = Number(quantities[index] || 0);
    const unitValue = Number(unitValues[index] || 0);
    const discount = Number(discounts[index] || 0);
    return {
      description,
      code: codes[index] || "",
      cfop: cfops[index] || "",
      quantity,
      unit: units[index] || "UN",
      unitValue,
      discount,
      total: Math.max(quantity * unitValue - discount, 0)
    };
  }).filter((item) => item.description && item.quantity > 0);
}

function buildInvoiceHtml(invoice, company) {
  const logo = company.logoDataUrl || new URL("assets/flow-logo.png", window.location.href).href;
  const itemsRows = invoice.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.cfop)}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td>${number.format(item.quantity)}</td>
      <td>${money(item.unitValue)}</td>
      <td>${money(item.discount)}</td>
      <td>${money(item.total)}</td>
    </tr>
  `).join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nota Fiscal Demo ${escapeHtml(invoice.number)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#eef4f1;color:#092d23}
    .note{max-width:1040px;margin:28px auto;background:#fff;border:1px solid #cfdcd6;padding:28px}
    header{display:grid;grid-template-columns:210px 1fr auto;gap:18px;align-items:center;border-bottom:3px solid #168a4a;padding-bottom:18px}
    img{max-width:190px;max-height:86px;object-fit:contain}
    h1{margin:0;font-size:28px}.badge{background:#168a4a;color:#fff;padding:10px 14px;font-weight:800}
    .demo{margin:18px 0;padding:12px;border:1px dashed #d7a31d;background:#fff9e8;color:#6f5104;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.box{border:1px solid #dce5e0;padding:14px}
    h2{font-size:16px;margin:0 0 10px}p{margin:4px 0;line-height:1.45}
    table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #dce5e0;padding:9px;text-align:left;font-size:13px}th{background:#f3f7f5}
    .totals{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.total{background:#f3f7f5;border:1px solid #dce5e0;padding:12px}
    .grand{background:#092d23;color:#fff}.sign{margin-top:20px;border-top:1px solid #dce5e0;padding-top:14px}
    @media print{body{background:#fff}.note{margin:0;border:0}.no-print{display:none}}
  </style>
</head>
<body>
  <main class="note">
    <header>
      <img src="${logo}" alt="Logotipo da empresa">
      <div>
        <h1>${escapeHtml(invoice.model)} ${escapeHtml(invoice.number)} / Série ${escapeHtml(invoice.series)}</h1>
        <p><strong>Natureza:</strong> ${escapeHtml(invoice.operationNature)} • <strong>Operação:</strong> ${escapeHtml(invoice.operationType)}</p>
        <p><strong>Emissão:</strong> ${escapeHtml(invoice.issueDate)} • <strong>Finalidade:</strong> ${escapeHtml(invoice.purpose)}</p>
      </div>
      <div class="badge">NOTA DEMO</div>
    </header>
    <div class="demo">Documento demonstrativo gerado pela Flow ERP. Não possui validade fiscal e não foi transmitido para órgãos fiscais.</div>
    <section class="grid">
      <div class="box">
        <h2>Emitente</h2>
        <p><strong>${escapeHtml(company.name || "")}</strong></p>
        <p>CNPJ: ${escapeHtml(company.cnpj || "")}</p>
        <p>${escapeHtml(company.address || "")}</p>
        <p>${escapeHtml(company.city || "")} - ${escapeHtml(company.state || "")}</p>
        <p>${escapeHtml(company.email || "")} ${company.phone ? `• ${escapeHtml(company.phone)}` : ""}</p>
      </div>
      <div class="box">
        <h2>Destinatário</h2>
        <p><strong>${escapeHtml(invoice.recipientName)}</strong></p>
        <p>CPF/CNPJ: ${escapeHtml(invoice.recipientDocument)}</p>
        <p>IE: ${escapeHtml(invoice.recipientStateRegistration || "Isento/Não informado")}</p>
        <p>${escapeHtml(invoice.recipientAddress)}, ${escapeHtml(invoice.recipientDistrict || "")}</p>
        <p>${escapeHtml(invoice.recipientCity)} - ${escapeHtml(invoice.recipientState)}</p>
        <p>${escapeHtml(invoice.recipientEmail)} ${invoice.recipientPhone ? `• ${escapeHtml(invoice.recipientPhone)}` : ""}</p>
      </div>
    </section>
    <section class="box" style="margin-top:14px">
      <h2>Chave e protocolo demo</h2>
      <p><strong>Chave de acesso:</strong> ${escapeHtml(invoice.accessKey)}</p>
      <p><strong>Protocolo:</strong> ${escapeHtml(invoice.protocol)}</p>
    </section>
    <table>
      <thead><tr><th>#</th><th>Descrição</th><th>NCM/Código</th><th>CFOP</th><th>Unid.</th><th>Qtd.</th><th>Unitário</th><th>Desconto</th><th>Total</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <section class="totals">
      <div class="total"><p>Produtos/Serviços</p><strong>${money(invoice.itemsTotal)}</strong></div>
      <div class="total"><p>Impostos</p><strong>${money(invoice.taxesTotal)}</strong></div>
      <div class="total"><p>Frete</p><strong>${money(invoice.freightValue)}</strong></div>
      <div class="total grand"><p>Total da nota</p><strong>${money(invoice.total)}</strong></div>
    </section>
    <section class="grid">
      <div class="box">
        <h2>Pagamento e transporte</h2>
        <p><strong>Forma:</strong> ${escapeHtml(invoice.paymentMethod)} • ${escapeHtml(invoice.paymentTerms)}</p>
        <p><strong>Vencimento:</strong> ${escapeHtml(invoice.paymentDueDate || "Não informado")}</p>
        <p><strong>Transportadora:</strong> ${escapeHtml(invoice.carrier || "Não informado")}</p>
      </div>
      <div class="box">
        <h2>Tributos informados</h2>
        <p>Base ICMS: ${money(invoice.icmsBase)} • ICMS: ${money(invoice.icmsValue)} • IPI: ${money(invoice.ipiValue)}</p>
        <p>PIS: ${money(invoice.pisValue)} • COFINS: ${money(invoice.cofinsValue)} • ISS: ${money(invoice.issValue)}</p>
      </div>
    </section>
    <section class="sign">
      <p><strong>Assinatura digital:</strong> ${escapeHtml(invoice.signatureFileName || "Arquivo não anexado")} • Responsável: ${escapeHtml(invoice.signatureResponsible)}</p>
      <p><strong>Informações complementares:</strong> ${escapeHtml(invoice.notes || "")}</p>
    </section>
    <p class="no-print"><button onclick="window.print()">Imprimir nota demo</button></p>
  </main>
</body>
</html>`;
}

function pdfEscape(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function makeSimplePdf(lines, filename) {
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const safeLines = lines.flatMap((line) => {
    const text = String(line ?? "");
    return text.length > 96 ? text.match(/.{1,96}(\s|$)/g) || [text] : [text];
  });
  const content = [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    "14 TL",
    ...safeLines.map((line, index) => `${index ? "T*" : ""} (${pdfEscape(line.trim())}) Tj`),
    "ET"
  ].join("\n");
  const pages = addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject("<< /Type /Catalog /Pages 1 0 R >>");
  addObject("<< /Type /Page /Parent 1 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(chunks.join("").length);
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });
  const xrefOffset = chunks.join("").length;
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`));
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 2 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  const blob = new Blob(chunks, { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return pages;
}

function buildTimesheetHtml(employee, company, entries, periodStart, periodEnd, signature) {
  const logo = company?.logoDataUrl || new URL("assets/flow-logo.png", window.location.href).href;
  const entriesForPeriod = entries.filter((entry) => entry.date >= periodStart && entry.date <= periodEnd);
  const rows = eachDate(periodStart, periodEnd).map((date) => {
    const dayEntries = entriesForPeriod.filter((entry) => entry.date === date);
    const byType = Object.fromEntries(pointTypeConfig().map((type) => [type.label, dayEntries.find((entry) => entry.type === type.label)]));
    const location = dayEntries.map((entry) => entry.address || entry.mapLabel || "").filter(Boolean)[0] || "";
    return `
      <tr>
        <td>${dateBr(date)}</td>
        ${pointTypeConfig().map((type) => `<td>${escapeHtml(byType[type.label]?.time || "-")}</td>`).join("")}
        <td>${escapeHtml(location || "-")}</td>
        <td>${dayEntries.some((entry) => entry.editedByHr || entry.manual) ? "Ajustado pelo RH" : ""}</td>
      </tr>
    `;
  }).join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Espelho de Ponto - ${escapeHtml(employee?.name || "Funcionario")}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#eef4f1;color:#092d23}
    .sheet{max-width:1120px;margin:24px auto;background:#fff;border:1px solid #cfdcd6;padding:28px}
    header{display:grid;grid-template-columns:200px 1fr;gap:18px;align-items:center;border-bottom:3px solid #168a4a;padding-bottom:18px}
    img{max-width:180px;max-height:82px;object-fit:contain}h1{margin:0;font-size:26px}p{margin:4px 0;line-height:1.45}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.box{border:1px solid #dce5e0;padding:14px}
    table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #dce5e0;padding:8px;text-align:left;font-size:12px}th{background:#f3f7f5}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:24px}.line{border-top:1px solid #092d23;padding-top:8px;text-align:center}
    .no-print{margin-top:18px}.no-print button{min-height:38px;padding:0 14px;border:1px solid #168a4a;background:#168a4a;color:#fff;font-weight:700}
    @media print{body{background:#fff}.sheet{margin:0;border:0}.no-print{display:none}}
  </style>
</head>
<body>
  <main class="sheet">
    <header>
      <img src="${logo}" alt="Logotipo da empresa">
      <div>
        <h1>Espelho de Ponto</h1>
        <p><strong>Periodo:</strong> ${dateBr(periodStart)} ate ${dateBr(periodEnd)}</p>
        <p><strong>Gerado em:</strong> ${new Date().toLocaleString("pt-BR")}</p>
      </div>
    </header>
    <section class="grid">
      <div class="box">
        <h2>Empresa</h2>
        <p><strong>${escapeHtml(company?.name || "")}</strong></p>
        <p>CNPJ: ${escapeHtml(company?.cnpj || "")}</p>
        <p>${escapeHtml(company?.address || "")}</p>
        <p>${escapeHtml(company?.city || "")} - ${escapeHtml(company?.state || "")}</p>
      </div>
      <div class="box">
        <h2>Funcionario</h2>
        <p><strong>${escapeHtml(employee?.name || "")}</strong></p>
        <p>CPF: ${escapeHtml(employee?.cpf || "")}</p>
        <p>Documento profissional: ${escapeHtml(employee?.professionalDocument || employee?.registrationNumber || "Nao informado")}</p>
        <p>Cargo: ${escapeHtml(employee?.role || "")} - Departamento: ${escapeHtml(employee?.department || "")}</p>
        <p>Admissao: ${dateBr(employee?.admissionDate || "")} - Jornada: ${escapeHtml(employee?.workSchedule || "")}</p>
      </div>
    </section>
    <table>
      <thead><tr><th>Data</th><th>Entrada</th><th>Saida almoco</th><th>Retorno almoco</th><th>Saida</th><th>Local</th><th>Observacao</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="sign">
      <div class="line">Assinatura do funcionario<br>${signature ? `Assinado digitalmente em ${new Date(signature.signedAt || signature.createdAt).toLocaleString("pt-BR")}` : "Pendente"}</div>
      <div class="line">Responsavel da empresa</div>
    </section>
    <p class="no-print"><button onclick="window.print()">Imprimir ou salvar em PDF</button></p>
  </main>
</body>
</html>`;
}

function openTimesheetHtml(html, filename) {
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadPointReport(employeeId, startDate = "", endDate = "", signatureId = "") {
  const employee = await repository.get("employees", employeeId);
  if (!employee) {
    toast("Funcionario nao encontrado para gerar o espelho.");
    return;
  }
  const company = appState.currentCompany || await repository.get("companies", employee.companyId);
  const fallbackRange = monthRange(new Date().toISOString().slice(0, 7));
  const periodStart = startDate || fallbackRange.start;
  const periodEnd = endDate || fallbackRange.end;
  const entries = (await repository.all("timeEntries"))
    .filter((entry) => entry.employeeId === employeeId)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const signature = signatureId ? await repository.get("timesheetSignatures", signatureId) : (await repository.all("timesheetSignatures"))
    .find((item) => item.employeeId === employeeId && item.periodStart === periodStart && item.periodEnd === periodEnd);
  const html = buildTimesheetHtml(employee, company, entries, periodStart, periodEnd, signature);
  openTimesheetHtml(html, `espelho-ponto-${digitsOnly(employee.cpf || employee.name)}-${periodStart}-${periodEnd}.html`);
}

async function getEmployeeContext() {
  const session = JSON.parse(localStorage.getItem(employeeSessionKey) || "null");
  if (!session?.employeeId || !session?.companyId) return null;
  const [employee, company] = await Promise.all([
    repository.get("employees", session.employeeId),
    repository.get("companies", session.companyId)
  ]);
  if (!employee || !company) return null;
  appState.currentEmployee = employee;
  appState.currentCompany = company;
  return { employee, company };
}

function employeePunchTypes() {
  return pointTypeConfig().map((type) => type.label);
}

async function employeePortalModule() {
  const context = await getEmployeeContext();
  if (!context) {
    await setView("employee-login");
    return "";
  }
  const { employee } = context;
  document.querySelector("[data-employee-name]").textContent = employee.name || "colaborador";
  const today = new Date().toISOString().slice(0, 10);
  const [allEntries, allMessages, allCertificates, allSignatures] = await Promise.all([
    repository.all("timeEntries"),
    repository.all("hrMessages"),
    repository.all("medicalCertificates"),
    repository.all("timesheetSignatures")
  ]);
  const entries = allEntries.filter((entry) => entry.employeeId === employee.id).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const todayEntries = entries.filter((entry) => entry.date === today);
  const currentRange = monthRange(today.slice(0, 7));
  const currentSignature = allSignatures.find((signature) => signature.employeeId === employee.id && signature.periodStart === currentRange.start && signature.periodEnd === currentRange.end);
  const messages = allMessages.filter((message) => message.employeeId === employee.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const certificates = allCertificates.filter((file) => file.employeeId === employee.id).map((file) => ({ ...file, storeName: "medicalCertificates" }));
  return `
    <section class="employee-panel">
      <div class="employee-card">
        <h2>Ponto eletrônico</h2>
        <p>Registre suas quatro batidas diárias. O navegador pedirá permissão para usar sua localização.</p>
        <div class="punch-grid">
          ${employeePunchTypes().map((type) => {
            const done = todayEntries.find((entry) => entry.type === type);
            return `<button class="${done ? "secondary-button" : "primary-button"}" type="button" data-punch-type="${type}" ${done ? "disabled" : ""}>${done ? `${type}: ${done.time}` : type}</button>`;
          }).join("")}
        </div>
        <div class="module-message" data-employee-message></div>
      </div>
      <div class="employee-card">
        <h2>Minhas batidas</h2>
        ${entries.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Horário</th><th>Local</th></tr></thead>
              <tbody>${entries.slice(0, 20).map((entry) => `<tr><td>${entry.date}</td><td>${entry.type}</td><td>${entry.time}</td><td>${escapeHtml(entry.address || entry.mapLabel || "")}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        ` : emptyState("Você ainda não registrou nenhuma batida.")}
        <button class="secondary-button full" type="button" data-point-report="${employee.id}" data-report-start="${currentRange.start}" data-report-end="${currentRange.end}">Baixar espelho do mes</button>
      </div>
      <div class="employee-card">
        <h2>Espelho do mes</h2>
        <p>${currentSignature ? `Assinado em ${new Date(currentSignature.signedAt || currentSignature.createdAt).toLocaleString("pt-BR")}.` : `Confira suas batidas de ${monthLabel(today.slice(0, 7))} e assine para o RH fechar o periodo.`}</p>
        <button class="${currentSignature ? "secondary-button" : "primary-button"} full" type="button" data-sign-timesheet ${currentSignature ? "disabled" : ""}>${currentSignature ? "Espelho assinado" : "Assinar espelho do mes"}</button>
        <button class="secondary-button full" type="button" data-point-report="${employee.id}" data-report-start="${currentRange.start}" data-report-end="${currentRange.end}" data-signature-id="${currentSignature?.id || ""}">Baixar minha copia</button>
      </div>
      <div class="employee-card">
        <h2>Atestados médicos</h2>
        <form class="module-form compact-form" data-form="medical-certificate" enctype="multipart/form-data" novalidate>
          ${fileField("Anexar atestado", "certificate", false)}
          <label>Observação<textarea name="note" placeholder="Descreva o período ou detalhe para o RH"></textarea></label>
          <button class="primary-button full" type="submit">Enviar atestado</button>
        </form>
        ${certificates.length ? certificates.map((file) => `<article class="file-card"><strong>${escapeHtml(file.fileName)}</strong>${fileActions(file)}</article>`).join("") : emptyState("Nenhum atestado enviado.")}
      </div>
      <div class="employee-card">
        <h2>Chat com RH</h2>
        <div class="employee-chat">
          ${messages.length ? messages.map((message) => `<article class="chat-card ${message.direction === "employee" ? "from-employee" : "from-hr"}"><strong>${message.direction === "employee" ? "Você" : "RH"}</strong><span>${new Date(message.createdAt).toLocaleString("pt-BR")}</span><p>${escapeHtml(message.message)}</p></article>`).join("") : emptyState("Envie uma mensagem para abrir uma conversa com o RH.")}
        </div>
        <form class="module-form" data-form="employee-message" novalidate>
          <label>Mensagem ao RH<textarea name="message" required></textarea></label>
          <button class="primary-button full" type="submit">Enviar mensagem</button>
        </form>
      </div>
    </section>
  `;
}

async function renderEmployeePortal() {
  const content = document.querySelector("[data-employee-portal-content]");
  content.innerHTML = await employeePortalModule();
  initIcons();
}

function getBrowserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ error: "Geolocalização indisponível neste navegador." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      (error) => resolve({ error: error.message }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

async function reverseGeocode(latitude, longitude) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
    if (!response.ok) throw new Error("Falha ao buscar endereço");
    const data = await response.json();
    return data.display_name || "";
  } catch {
    return "";
  }
}

async function punchClock(type) {
  const context = await getEmployeeContext();
  if (!context) return;
  const target = document.querySelector("[data-employee-message]");
  target.textContent = "Buscando localização...";
  target.className = "module-message";
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const existing = (await repository.all("timeEntries")).find((entry) => entry.employeeId === context.employee.id && entry.date === today && entry.type === type);
  if (existing) {
    target.textContent = "Esta batida já foi registrada hoje.";
    target.className = "module-message error";
    return;
  }
  const location = await getBrowserLocation();
  const address = location.latitude ? await reverseGeocode(location.latitude, location.longitude) : "";
  await repository.add("timeEntries", {
    companyId: context.company.id,
    employeeId: context.employee.id,
    type,
    date: today,
    time: now.toTimeString().slice(0, 5),
    timestamp: now.toISOString(),
    latitude: location.latitude || "",
    longitude: location.longitude || "",
    accuracy: location.accuracy || "",
    address,
    mapLabel: location.latitude ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : location.error
  });
  await repository.add("logs", { companyId: context.company.id, employeeId: context.employee.id, type: "time_entry", detail: type });
  toast("Ponto registrado.");
  await renderEmployeePortal();
}

function reportsModule(data) {
  const won = data.sales.filter((sale) => sale.stage === "Ganho").reduce((sum, sale) => sum + Number(sale.value || 0), 0);
  const stockLow = data.inventory.filter((item) => Number(item.quantity) <= Number(item.minQuantity)).length;
  return `
    <section class="report-panel">
      <h2>Relatório executivo</h2>
      <p>Resumo gerado automaticamente a partir dos registros salvos no banco local da Flow ERP.</p>
      <div class="report-metrics">
        <article><span>Receita total</span><strong>${money(data.revenue)}</strong></article>
        <article><span>Lucro estimado</span><strong>${money(data.profit)}</strong></article>
        <article><span>Vendas ganhas</span><strong>${money(won)}</strong></article>
        <article><span>Notas demo</span><strong>${data.invoices.length}</strong></article>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Área</th><th>Indicador</th><th>Leitura de gestão</th></tr></thead>
          <tbody>
            <tr><td>Financeiro</td><td>${data.financial.length} lançamentos</td><td>Receitas e despesas alimentam o resultado operacional.</td></tr>
            <tr><td>Comercial</td><td>${data.sales.length} oportunidades</td><td>Pipeline conectado ao cadastro de clientes e à rotina de gestão.</td></tr>
            <tr><td>RH</td><td>${data.employees.length} funcionários</td><td>Base de equipe pronta para permissões e processos internos.</td></tr>
            <tr><td>Documentos</td><td>${data.documents.length} registros</td><td>Biblioteca documental preparada para organização e governança.</td></tr>
            <tr><td>Fiscal</td><td>${data.invoices.length} notas demo</td><td>Emissão demonstrativa com itens, tributos, assinatura e documento gerado.</td></tr>
            <tr><td>Estoque</td><td>${stockLow} itens críticos</td><td>Produtos abaixo do mínimo merecem reposição ou revisão operacional.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function settingsModule(company, privacyRequests) {
  return `
    <div class="settings-layout">
      <section class="module-panel">
        <h2>Dados da empresa</h2>
        <p>Preencha as informações institucionais. Ao salvar, os dados ficam gravados no banco local do navegador e disponíveis no próximo acesso.</p>
        <form class="module-form settings-form" data-module-form="settings" enctype="multipart/form-data" novalidate>
          <div class="settings-block">
            <h3>Identidade</h3>
            <div class="company-logo-upload">
              <div class="company-logo-preview">${company.logoDataUrl ? `<img src="${company.logoDataUrl}" alt="Logotipo da empresa">` : `<span>Logo da empresa</span>`}</div>
              ${fileField("Enviar logotipo da empresa", "companyLogo", false)}
            </div>
          </div>
          <div class="settings-block">
            <h3>Dados cadastrais</h3>
            <div class="form-grid">
              ${formField("Razão social", "name", "text", company.name || "", "required")}
              ${formField("Nome fantasia", "tradeName", "text", company.tradeName || "")}
              ${formField("CNPJ", "cnpj", "text", company.cnpj || "", "required")}
              ${formField("Inscrição estadual", "stateRegistration", "text", company.stateRegistration || "")}
              ${formField("Inscrição municipal", "cityRegistration", "text", company.cityRegistration || "")}
              ${formField("Segmento", "segment", "text", company.segment || "", "required")}
              ${selectField("Quantidade de colaboradores", "employeesRange", ["1 a 10", "11 a 50", "51 a 200", "201+"], company.employeesRange || "")}
              ${formField("Regime tributário", "taxRegime", "text", company.taxRegime || "")}
            </div>
          </div>
          <div class="settings-block">
            <h3>Contato</h3>
            <div class="form-grid">
              ${formField("E-mail da empresa", "email", "email", company.email || "", "required")}
              ${formField("Telefone", "phone", "tel", company.phone || "", "required")}
              ${formField("Site", "website", "url", company.website || "")}
              ${formField("WhatsApp", "whatsapp", "tel", company.whatsapp || "")}
            </div>
          </div>
          <div class="settings-block">
            <h3>Endereço</h3>
            <div class="form-grid">
              ${formField("CEP", "zipCode", "text", company.zipCode || "")}
              ${formField("Cidade", "city", "text", company.city || "", "required")}
              ${selectField("Estado", "state", ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"], company.state || "")}
              ${formField("Bairro", "district", "text", company.district || "")}
            </div>
            <label>Endereço completo<textarea name="address" required>${escapeHtml(company.address || "")}</textarea></label>
          </div>
          <div class="settings-block">
            <h3>Responsável</h3>
            <div class="form-grid">
              ${formField("Responsável", "responsible", "text", company.responsible || appState.currentUser?.fullName || "", "required")}
              ${formField("Cargo do responsável", "responsibleRole", "text", company.responsibleRole || "", "required")}
              ${formField("E-mail do responsável", "responsibleEmail", "email", company.responsibleEmail || appState.currentUser?.email || "")}
              ${formField("Telefone do responsável", "responsiblePhone", "tel", company.responsiblePhone || "")}
            </div>
          </div>
          <div class="module-message" data-module-message></div>
          <button class="primary-button full" type="submit">Salvar dados da empresa</button>
        </form>
      </section>
      <aside class="quick-panel">
        <h2>Central de Privacidade</h2>
        <p>Registre solicitações LGPD para acesso, alteração, exclusão ou revogação de consentimento.</p>
        <button class="secondary-button full" type="button" data-privacy-request="Acesso aos dados">Solicitar acesso aos dados</button>
        <button class="secondary-button full" type="button" data-privacy-request="Alteração cadastral">Solicitar alteração</button>
        <button class="secondary-button full" type="button" data-privacy-request="Exclusão de dados">Solicitar exclusão</button>
        <button class="secondary-button full" type="button" data-privacy-request="Revogação de consentimento">Revogar consentimento</button>
        <div class="privacy-request-list">
          ${privacyRequests.length ? privacyRequests.map((request) => `<article><strong>${escapeHtml(request.type)}</strong><span>${escapeHtml(request.status)} • ${new Date(request.createdAt).toLocaleString("pt-BR")}</span></article>`).join("") : "<article><strong>Nenhuma solicitação</strong><span>Use os botões acima quando precisar.</span></article>"}
        </div>
      </aside>
    </div>
  `;
}

async function renderModule(module = appState.currentModule) {
  appState.currentModule = module;
  setTopbar();
  document.querySelectorAll("[data-module-nav] button").forEach((button) => {
    button.classList.toggle("active", button.dataset.module === module);
  });

  const content = document.querySelector("[data-module-content]");
  const data = await dashboardData();
  toggleDashboardKpis(module === "dashboard");
  if (module === "dashboard") await renderKpis();
  content.classList.toggle("module-mode", module !== "dashboard");

  if (module === "dashboard") content.innerHTML = dashboardModule(data);
  if (module === "financial") content.innerHTML = financialModule(data.financial);
  if (module === "sales") content.innerHTML = salesModule(data.sales);
  if (module === "clients") content.innerHTML = clientsModule(data.clients);
  if (module === "employees") content.innerHTML = employeesModule(data.employees, data.employeeFiles, data.medicalCertificates, data.hrMessages);
  if (module === "attendance") content.innerHTML = attendanceModule(data.employees, data.timeEntries, data.timesheetSignatures);
  if (module === "inventory") content.innerHTML = inventoryModule(data.inventory);
  if (module === "tasks") content.innerHTML = tasksModule(data.tasks);
  if (module === "documents") content.innerHTML = documentsModule(data.documents, data.documentFolders);
  if (module === "invoices") content.innerHTML = invoicesModule(data.invoices);
  if (module === "reports") content.innerHTML = reportsModule(data);
  if (module === "settings") {
    const requests = companyFilter(await repository.all("privacyRequests"));
    content.innerHTML = settingsModule(appState.currentCompany, requests);
  }

  initIcons();
  if (module === "dashboard") {
    drawChart(
      "erpChart",
      ["Receita", "Despesa", "Lucro", "Clientes"],
      [data.revenue / 1000, data.expenses / 1000, Math.max(data.profit, 0) / 1000, data.clients.length * 12, data.tasks.length * 10],
      [data.expenses / 1000, data.expenses / 1000, 0, data.employees.length * 8, data.documents.length * 7]
    );
  }
}

async function setView(name) {
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === name);
  });
  document.body.classList.toggle("auth-mode", name === "login" || name === "signup" || name === "employee-login" || name === "employee-password");
  document.body.classList.toggle("dashboard-mode", name === "dashboard");
  document.body.classList.toggle("employee-mode", name === "employee-portal");
  if (name === "dashboard") {
    await getContext();
    await renderModule(appState.currentModule || "dashboard");
  }
  if (name === "employee-portal") {
    await renderEmployeePortal();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validateLead(data) {
  const required = ["fullName", "email", "phone", "company", "cnpj", "role", "employees", "segment", "city", "state"];
  const errors = required.filter((field) => !validators.required(data[field]));
  if (!validators.email(data.email)) errors.push("email");
  if (!validators.phone(data.phone)) errors.push("phone");
  if (!validators.cnpj(data.cnpj)) errors.push("cnpj");
  if (!data.consent) errors.push("consent");
  return [...new Set(errors)];
}

function validateSignup(data) {
  const required = ["fullName", "email", "phone", "company", "cnpj", "password", "confirmPassword"];
  const errors = required.filter((field) => !validators.required(data[field]));
  if (!validators.email(data.email)) errors.push("email");
  if (!validators.phone(data.phone)) errors.push("phone");
  if (!validators.cnpj(data.cnpj)) errors.push("cnpj");
  if (!validators.password(data.password)) errors.push("password");
  if (data.password !== data.confirmPassword) errors.push("confirmPassword");
  if (!data.terms) errors.push("terms");
  return [...new Set(errors)];
}

async function handleLead(form) {
  const data = collectForm(form);
  const errors = validateLead(data);
  markValidity(form, errors);
  if (errors.length) {
    showMessage("lead", "Revise os campos destacados e aceite o consentimento LGPD para continuar.", "error");
    return;
  }

  const consent = await repository.add("consents", {
    ownerEmail: data.email,
    companyId: null,
    source: "pre-cadastro",
    acceptedText: "Li e concordo com a Política de Privacidade e estou ciente do tratamento dos meus dados pessoais para as finalidades apresentadas.",
    purpose: data.purpose,
    consentedAt: new Date().toISOString(),
    revocationAvailable: true,
    accessRequestAvailable: true,
    deletionRequestAvailable: true,
    correctionRequestAvailable: true,
    cookieManagementAvailable: true
  });

  await repository.add("preRegistrations", {
    ...data,
    consentId: consent.id,
    storageTarget: "IndexedDB.preRegistrations",
    readyForApiPersistence: true
  });

  showMessage("lead", "Pré-cadastro realizado com sucesso! Seus dados foram salvos no banco local e estão prontos para integração com backend.", "success");
  form.reset();
}

async function handleSignup(form) {
  const data = collectForm(form);
  const errors = validateSignup(data);
  markValidity(form, errors);
  if (errors.length) {
    showMessage("signup", "Confira os campos obrigatórios. A senha precisa ter 8 caracteres, maiúscula, minúscula e número.", "error");
    return;
  }

  const existing = await repository.findBy("users", "email", data.email);
  if (existing) {
    showMessage("signup", "Este e-mail já possui conta. Use a tela de login para acessar.", "error");
    return;
  }

  const company = await repository.add("companies", {
    name: data.company,
    tradeName: data.company,
    cnpj: data.cnpj,
    email: data.email,
    phone: data.phone,
    responsible: data.fullName
  });

  const user = await repository.add("users", {
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    companyId: company.id,
    passwordHash: await hashPassword(data.password),
    authProviderReady: true,
    twoFactorReady: true,
    sessionControlReady: true,
    permissionProfile: "admin"
  });

  await repository.add("permissions", {
    companyId: company.id,
    userId: user.id,
    profile: "admin",
    modules: Object.keys(moduleInfo)
  });
  await repository.add("logs", { companyId: company.id, userId: user.id, type: "signup", detail: "Conta criada na experiência Flow ERP" });
  localStorage.setItem(sessionKey, JSON.stringify({ userId: user.id, companyId: company.id }));
  appState.currentUser = user;
  appState.currentCompany = company;
  await ensureDemoData(company.id);

  showMessage("signup", "Conta criada e salva no banco local. Abrindo o dashboard...", "success");
  setTimeout(() => setView("dashboard"), 700);
}

async function handleLogin(form) {
  const data = collectForm(form);
  const errors = [];
  if (!validators.email(data.email)) errors.push("email");
  if (!validators.required(data.password)) errors.push("password");
  markValidity(form, errors);
  if (errors.length) {
    showMessage("login", "Informe e-mail válido e senha para acessar.", "error");
    return;
  }

  let user = await repository.findBy("users", "email", data.email);
  if (!user) {
    const company = await repository.add("companies", {
      name: "Empresa criada pelo login demo",
      tradeName: "Flow Demo",
      cnpj: "11222333000181",
      email: data.email,
      responsible: data.email.split("@")[0]
    });
    user = await repository.add("users", {
      fullName: data.email.split("@")[0],
      email: data.email,
      companyId: company.id,
      passwordHash: await hashPassword(data.password),
      permissionProfile: "admin"
    });
    await ensureDemoData(company.id);
  } else if (user.passwordHash !== await hashPassword(data.password)) {
    showMessage("login", "Senha inválida para este usuário.", "error");
    return;
  }

  const company = await repository.get("companies", user.companyId);
  localStorage.setItem(sessionKey, JSON.stringify({ userId: user.id, companyId: company.id }));
  appState.currentUser = user;
  appState.currentCompany = company;
  await repository.add("logs", { companyId: company.id, userId: user.id, type: "login", detail: "Sessão iniciada" });
  showMessage("login", "Acesso validado. Abrindo o dashboard...", "success");
  setTimeout(() => setView("dashboard"), 500);
}

async function handleEmployeeLogin(form) {
  const data = collectForm(form);
  const cpf = digitsOnly(data.cpf);
  const errors = [];
  if (!validators.cpf(cpf)) errors.push("cpf");
  if (!validators.required(data.password)) errors.push("password");
  markValidity(form, errors);
  if (errors.length) {
    showMessage("employee-login", "Informe CPF válido e senha.", "error");
    return;
  }

  const employees = await repository.all("employees");
  const employee = employees.find((item) => digitsOnly(item.cpf) === cpf || item.accessUsername === cpf);
  if (!employee) {
    showMessage("employee-login", "Funcionário não encontrado. Verifique se o colaborador foi salvo no ERP neste navegador.", "error");
    return;
  }
  if (employee.status === "Desligado") {
    showMessage("employee-login", "Acesso indisponível para funcionário desligado.", "error");
    return;
  }
  const expected = employee.accessPasswordHash || await hashPassword("1234");
  if (expected !== await hashPassword(data.password)) {
    showMessage("employee-login", "Senha inválida.", "error");
    return;
  }

  localStorage.setItem(employeeSessionKey, JSON.stringify({ employeeId: employee.id, companyId: employee.companyId }));
  appState.currentEmployee = employee;
  appState.currentCompany = await repository.get("companies", employee.companyId);
  await repository.add("logs", { companyId: employee.companyId, employeeId: employee.id, type: "employee_login", detail: "Acesso funcionário" });
  if (employee.mustChangePassword) {
    showMessage("employee-login", "Primeiro acesso validado. Crie uma nova senha.", "success");
    setTimeout(() => setView("employee-password"), 500);
  } else {
    showMessage("employee-login", "Acesso validado. Abrindo portal.", "success");
    setTimeout(() => setView("employee-portal"), 500);
  }
}

async function handleEmployeePassword(form) {
  const context = await getEmployeeContext();
  if (!context) {
    await setView("employee-login");
    return;
  }
  const data = collectForm(form);
  const errors = [];
  if (!validators.password(data.password)) errors.push("password");
  if (data.password !== data.confirmPassword) errors.push("confirmPassword");
  markValidity(form, errors);
  if (errors.length) {
    showMessage("employee-password", "A nova senha precisa ter 8 caracteres, maiúscula, minúscula e número.", "error");
    return;
  }
  appState.currentEmployee = await repository.put("employees", {
    ...context.employee,
    accessPasswordHash: await hashPassword(data.password),
    mustChangePassword: false
  });
  await repository.add("logs", { companyId: context.company.id, employeeId: context.employee.id, type: "employee_password_update", detail: "Senha inicial alterada" });
  showMessage("employee-password", "Senha salva. Abrindo seu portal.", "success");
  setTimeout(() => setView("employee-portal"), 500);
}

async function handleMedicalCertificate(form) {
  const context = await getEmployeeContext();
  if (!context) return;
  const file = (await filesFromInput(form.elements.certificate))[0];
  if (!file) {
    toast("Selecione um arquivo de atestado.");
    return;
  }
  const data = collectForm(form);
  await repository.add("medicalCertificates", {
    ...file,
    note: data.note || "",
    companyId: context.company.id,
    employeeId: context.employee.id
  });
  await repository.add("logs", { companyId: context.company.id, employeeId: context.employee.id, type: "medical_certificate_upload", detail: file.fileName });
  form.reset();
  toast("Atestado enviado ao RH.");
  await renderEmployeePortal();
}

async function handleEmployeeMessage(form) {
  const context = await getEmployeeContext();
  if (!context) return;
  const data = collectForm(form);
  if (!validators.required(data.message)) {
    toast("Digite uma mensagem para o RH.");
    return;
  }
  await repository.add("hrMessages", {
    companyId: context.company.id,
    employeeId: context.employee.id,
    direction: "employee",
    subject: "Dúvida do funcionário",
    message: data.message,
    readByHr: false
  });
  form.reset();
  toast("Mensagem enviada ao RH.");
  await renderEmployeePortal();
}

async function signCurrentTimesheet() {
  const context = await getEmployeeContext();
  if (!context) return;
  const range = monthRange(new Date().toISOString().slice(0, 7));
  const existing = (await repository.all("timesheetSignatures"))
    .find((signature) => signature.employeeId === context.employee.id && signature.periodStart === range.start && signature.periodEnd === range.end);
  if (existing) {
    toast("Espelho do mes ja assinado.");
    await renderEmployeePortal();
    return;
  }
  await repository.add("timesheetSignatures", {
    companyId: context.company.id,
    employeeId: context.employee.id,
    periodStart: range.start,
    periodEnd: range.end,
    signedAt: new Date().toISOString(),
    status: "Assinado pelo funcionario"
  });
  await repository.add("logs", { companyId: context.company.id, employeeId: context.employee.id, type: "timesheet_signature", detail: `${range.start} a ${range.end}` });
  toast("Espelho de ponto assinado.");
  await renderEmployeePortal();
}

async function handleModuleForm(form) {
  const module = form.dataset.moduleForm;
  const data = collectForm(form);
  const required = [...form.querySelectorAll("[required]")].map((field) => field.name);
  const errors = required.filter((field) => !validators.required(data[field]));
  if (data.email && !validators.email(data.email)) errors.push("email");
  if (data.phone && !validators.phone(data.phone)) errors.push("phone");
  if (data.cnpj && !validators.cnpj(data.cnpj)) errors.push("cnpj");
  if (data.cpf && !validators.cpf(data.cpf)) errors.push("cpf");
  markValidity(form, [...new Set(errors)]);
  if (errors.length) {
    moduleMessage("Revise os campos destacados antes de salvar.", "error");
    return;
  }

  if (module === "documentFolders") {
    await repository.add("documentFolders", {
      name: data.name,
      companyId: appState.currentCompany.id,
      userId: appState.currentUser.id
    });
    await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser.id, type: "folder_create", detail: data.name });
    toast("Pasta criada.");
    await renderModule("documents");
    return;
  }

  if (module === "hrMessage") {
    await repository.add("hrMessages", {
      companyId: appState.currentCompany.id,
      employeeId: data.employeeId,
      userId: appState.currentUser.id,
      direction: "hr",
      subject: data.subject,
      message: data.message,
      readByEmployee: false
    });
    await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser.id, type: "hr_message", detail: data.subject });
    form.reset();
    toast("Mensagem enviada ao funcionário.");
    await renderModule("employees");
    return;
  }

  if (module === "attendanceDay") {
    const entries = await repository.all("timeEntries");
    await Promise.all(pointTypeConfig().map(async (type) => {
      const time = data[`${type.key}Time`];
      if (!time) return;
      const address = data[`${type.key}Address`] || "Ajuste manual pelo RH";
      const existing = entries.find((entry) => entry.employeeId === data.employeeId && entry.date === data.date && entry.type === type.label);
      const payload = {
        companyId: appState.currentCompany.id,
        employeeId: data.employeeId,
        type: type.label,
        date: data.date,
        time,
        timestamp: `${data.date}T${time}:00`,
        address,
        mapLabel: address,
        manual: true,
        editedByHr: true,
        userId: appState.currentUser.id
      };
      if (existing) await repository.put("timeEntries", { ...existing, ...payload });
      else await repository.add("timeEntries", payload);
    }));
    await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser.id, type: "attendance_day_update", detail: `${data.employeeId} ${data.date}` });
    toast("Ponto do dia salvo.");
    await renderModule("attendance");
    return;
  }

  if (module === "attendanceReport") {
    if (!data.startDate || !data.endDate || data.startDate > data.endDate) {
      moduleMessage("Selecione um periodo valido para baixar o espelho.", "error");
      return;
    }
    await downloadPointReport(data.employeeId, data.startDate, data.endDate);
    moduleMessage("Espelho gerado. Use o botao imprimir para salvar como PDF.", "success");
    return;
  }

  if (module === "settings") {
    const logo = (await filesFromInput(form.elements.companyLogo))[0];
    delete data.companyLogo;
    appState.currentCompany = await repository.put("companies", {
      ...appState.currentCompany,
      ...data,
      ...(logo ? {
        logoDataUrl: logo.dataUrl,
        logoFileName: logo.fileName,
        logoMimeType: logo.mimeType
      } : {})
    });
    await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser.id, type: "company_update", detail: "Dados da empresa atualizados" });
    toast("Configurações salvas.");
    await renderModule("settings");
    await renderKpis();
    return;
  }

  if (module === "employees") {
    const employeeDocs = await filesFromInput(form.elements.employeeDocuments);
    delete data.employeeDocuments;
    const cpf = digitsOnly(data.cpf);
    const employee = await repository.add("employees", {
      ...data,
      cpf,
      status: data.status || "Ativo",
      accessUsername: cpf,
      accessPasswordHash: await hashPassword("1234"),
      mustChangePassword: true,
      companyId: appState.currentCompany.id,
      userId: appState.currentUser.id
    });
    await Promise.all(employeeDocs.map((file) => repository.add("employeeFiles", {
      ...file,
      employeeId: employee.id,
      companyId: appState.currentCompany.id,
      userId: appState.currentUser.id
    })));
    await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser.id, type: "employee_create", detail: employee.name });
    form.reset();
    toast("Funcionário salvo. Acesso: CPF e senha inicial 1234.");
    await renderModule("employees");
    return;
  }

  if (module === "documents") {
    const file = (await filesFromInput(form.elements.documentFile))[0];
    delete data.documentFile;
    await repository.add("documents", {
      ...data,
      ...(file || {}),
      companyId: appState.currentCompany.id,
      userId: appState.currentUser.id
    });
    await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser.id, type: "document_create", detail: data.name });
    form.reset();
    toast("Documento salvo na pasta selecionada.");
    await renderModule("documents");
    return;
  }

  if (module === "invoices") {
    const items = collectInvoiceItems(form);
    const signature = (await filesFromInput(form.elements.digitalSignature))[0];
    delete data.digitalSignature;
    const requiredInvoiceFields = ["number", "series", "issueDate", "operationNature", "recipientName", "recipientDocument", "recipientEmail", "recipientAddress", "recipientCity"];
    const invoiceErrors = requiredInvoiceFields.filter((field) => !validators.required(data[field]));
    if (!items.length) invoiceErrors.push("itemDescription", "itemQuantity", "itemUnitValue");
    if (data.recipientEmail && !validators.email(data.recipientEmail)) invoiceErrors.push("recipientEmail");
    markValidity(form, [...new Set(invoiceErrors)]);
    if (invoiceErrors.length) {
      moduleMessage("Preencha os dados principais da nota e ao menos um item válido.", "error");
      return;
    }

    const itemsTotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxesTotal = ["icmsValue", "ipiValue", "pisValue", "cofinsValue", "issValue"].reduce((sum, field) => sum + Number(data[field] || 0), 0);
    const invoice = {
      ...data,
      companyId: appState.currentCompany.id,
      userId: appState.currentUser.id,
      accessKey: data.accessKey || invoiceAccessKey(),
      protocol: data.protocol || invoiceProtocol(),
      items,
      itemsTotal,
      taxesTotal,
      freightValue: Number(data.freightValue || 0),
      total: itemsTotal + taxesTotal + Number(data.freightValue || 0),
      icmsBase: Number(data.icmsBase || 0),
      icmsValue: Number(data.icmsValue || 0),
      ipiValue: Number(data.ipiValue || 0),
      pisValue: Number(data.pisValue || 0),
      cofinsValue: Number(data.cofinsValue || 0),
      issValue: Number(data.issValue || 0),
      signatureResponsible: data.signatureResponsible,
      signatureFileName: signature?.fileName || "",
      signatureMimeType: signature?.mimeType || "",
      signatureDataUrl: signature?.dataUrl || ""
    };
    const html = buildInvoiceHtml(invoice, appState.currentCompany);
    const saved = await repository.add("invoices", {
      ...invoice,
      fileName: `nota-fiscal-demo-${invoice.number || Date.now()}.html`,
      mimeType: "text/html",
      size: html.length,
      dataUrl: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    });
    if (signature) {
      await repository.add("digitalSignatures", {
        ...signature,
        companyId: appState.currentCompany.id,
        userId: appState.currentUser.id,
        invoiceId: saved.id,
        responsible: data.signatureResponsible
      });
    }
    await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser.id, type: "invoice_demo_create", detail: `Nota demo ${invoice.number}` });
    form.reset();
    toast("Nota fiscal demo gerada e salva.");
    await renderModule("invoices");
    await previewStoredFile(saved.id);
    return;
  }

  await repository.add(module, {
    ...data,
    companyId: appState.currentCompany.id,
    userId: appState.currentUser.id
  });
  await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser.id, type: `${module}_create`, detail: "Registro criado" });
  form.reset();
  toast("Registro salvo no banco local da Flow ERP.");
  await renderModule(module);
}

async function privacyRequest(type) {
  await repository.add("privacyRequests", {
    companyId: appState.currentCompany.id,
    userId: appState.currentUser.id,
    type,
    status: "Aberta",
    requestedAt: new Date().toISOString()
  });
  await repository.add("logs", {
    companyId: appState.currentCompany.id,
    userId: appState.currentUser.id,
    type: "privacy_request",
    detail: type
  });
  toast("Solicitação registrada na Central de Privacidade.");
  await renderModule("settings");
}

function drawChart(canvasId, labels, revenue, expenses) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  chartState[canvasId] = { labels, revenue, expenses };
  const styles = getComputedStyle(document.documentElement);
  const lineColor = styles.getPropertyValue("--line").trim() || "#dce5e0";
  const mutedColor = styles.getPropertyValue("--muted").trim() || "#6e7a75";
  const pointFill = styles.getPropertyValue("--white").trim() || "#fff";
  const greenColor = styles.getPropertyValue("--green").trim() || "#168a4a";
  const warningColor = styles.getPropertyValue("--warning").trim() || "#d7a31d";
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.font = "14px Segoe UI, sans-serif";
  ctx.lineWidth = 2;

  const padding = 46;
  const max = Math.max(...revenue, ...expenses, 1) * 1.15;
  const xStep = (width - padding * 2) / Math.max(labels.length - 1, 1);
  const y = (value) => height - padding - (value / max) * (height - padding * 2);

  ctx.strokeStyle = lineColor;
  ctx.fillStyle = mutedColor;
  for (let i = 0; i < 4; i += 1) {
    const lineY = padding + i * ((height - padding * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(padding, lineY);
    ctx.lineTo(width - padding, lineY);
    ctx.stroke();
  }

  labels.forEach((label, index) => {
    ctx.fillText(label, padding + index * xStep - 18, height - 16);
  });

  const drawSeries = (values, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = padding + index * xStep;
      const pointY = y(value);
      if (index === 0) ctx.moveTo(x, pointY);
      else ctx.lineTo(x, pointY);
    });
    ctx.stroke();
    values.forEach((value, index) => {
      const x = padding + index * xStep;
      const pointY = y(value);
      ctx.fillStyle = pointFill;
      ctx.beginPath();
      ctx.arc(x, pointY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  };

  drawSeries(expenses, warningColor);
  drawSeries(revenue, greenColor);
}

function redrawCharts() {
  Object.entries(chartState).forEach(([canvasId, state]) => {
    drawChart(canvasId, state.labels, state.revenue, state.expenses);
  });
}

function openPolicy(key) {
  const dialog = document.querySelector("[data-policy-dialog]");
  const policy = policies[key] || policies.central;
  document.querySelector("[data-policy-title]").textContent = policy.title;
  document.querySelector("[data-policy-content]").innerHTML = policy.body;
  if (typeof dialog.showModal === "function") dialog.showModal();
}

function openAppDialog(title, body) {
  document.querySelector("[data-app-dialog-title]").textContent = title;
  document.querySelector("[data-app-dialog-content]").innerHTML = body;
  const dialog = document.querySelector("[data-app-dialog]");
  if (typeof dialog.showModal === "function") dialog.showModal();
}

async function showNotifications() {
  const data = await dashboardData();
  const range = monthRange(new Date().toISOString().slice(0, 7));
  const unsignedTimesheets = data.employees.filter((employee) => employee.status !== "Desligado" && !data.timesheetSignatures.some((signature) => signature.employeeId === employee.id && signature.periodStart === range.start && signature.periodEnd === range.end)).length;
  openAppDialog("Notificações", `
    <p><strong>${data.inventory.filter((item) => Number(item.quantity) <= Number(item.minQuantity)).length}</strong> itens abaixo ou próximos do estoque mínimo.</p>
    <p><strong>${data.sales.filter((sale) => sale.stage !== "Ganho" && sale.stage !== "Perdido").length}</strong> oportunidades comerciais em andamento.</p>
    <p><strong>${unsignedTimesheets}</strong> espelhos de ponto do mes aguardando assinatura.</p>
  `);
}

function showProfile() {
  openAppDialog("Perfil do usuário", `
    <p><strong>Nome:</strong> ${escapeHtml(appState.currentUser?.fullName || "Usuário")}</p>
    <p><strong>E-mail:</strong> ${escapeHtml(appState.currentUser?.email || "")}</p>
    <p><strong>Empresa:</strong> ${escapeHtml(appState.currentCompany?.name || "")}</p>
    <p><strong>Perfil:</strong> ${escapeHtml(appState.currentUser?.permissionProfile || "admin")}</p>
  `);
}

async function findStoredFile(id) {
  const [employeeFiles, documents, invoices, medicalCertificates] = await Promise.all([
    repository.all("employeeFiles"),
    repository.all("documents"),
    repository.all("invoices"),
    repository.all("medicalCertificates")
  ]);
  return [
    ...employeeFiles.map((file) => ({ ...file, storeName: "employeeFiles" })),
    ...documents.map((file) => ({ ...file, storeName: "documents" })),
    ...invoices.map((file) => ({ ...file, storeName: "invoices" })),
    ...medicalCertificates.map((file) => ({ ...file, storeName: "medicalCertificates" }))
  ]
    .find((file) => file.id === id);
}

async function previewStoredFile(id) {
  const file = await findStoredFile(id);
  if (!file?.dataUrl) {
    toast("Este registro não possui arquivo para visualizar.");
    return;
  }
  const win = window.open("", "_blank");
  if (!win) {
    toast("O navegador bloqueou a pré-visualização.");
    return;
  }
  const title = escapeHtml(file.fileName || "Documento");
  if (file.mimeType?.startsWith("image/") || file.mimeType === "application/pdf" || file.mimeType === "text/html") {
    win.document.write(`<title>${title}</title><iframe src="${file.dataUrl}" style="border:0;width:100%;height:100vh"></iframe>`);
  } else {
    win.document.write(`<title>${title}</title><body style="font-family:system-ui;padding:32px"><h1>${title}</h1><p>Pré-visualização indisponível para este tipo de arquivo. Use o botão baixar.</p><a download="${title}" href="${file.dataUrl}">Baixar arquivo</a></body>`);
  }
}

async function downloadStoredFile(id) {
  const file = await findStoredFile(id);
  if (!file?.dataUrl) {
    toast("Este registro não possui arquivo para baixar.");
    return;
  }
  const link = document.createElement("a");
  link.href = file.dataUrl;
  link.download = file.fileName || "flow-documento";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function terminateEmployee(id) {
  const employee = await repository.get("employees", id);
  if (!employee) return;
  await repository.put("employees", {
    ...employee,
    status: "Desligado",
    terminationDate: employee.terminationDate || new Date().toISOString().slice(0, 10)
  });
  await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser.id, type: "employee_terminate", detail: employee.name });
  toast("Funcionário marcado como desligado.");
  await renderModule("employees");
}

function bindEvents() {
  const header = document.querySelector("[data-header]");
  const nav = document.querySelector("[data-nav]");
  const actions = document.querySelector(".header-actions");
  const menuToggle = document.querySelector("[data-menu-toggle]");

  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 20);
  });

  menuToggle.addEventListener("click", () => {
    const open = !nav.classList.contains("open");
    nav.classList.toggle("open", open);
    actions.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-theme-toggle]")) {
      toggleTheme();
      return;
    }

    const viewLink = event.target.closest("[data-view-link]");
    if (viewLink) {
      nav.classList.remove("open");
      actions.classList.remove("open");
      document.body.classList.remove("menu-open");
      await setView(viewLink.dataset.viewLink);
    }

    const moduleButton = event.target.closest("[data-module]");
    if (moduleButton) await renderModule(moduleButton.dataset.module);

    const shortcut = event.target.closest("[data-module-shortcut]");
    if (shortcut) await renderModule(shortcut.dataset.moduleShortcut);

    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) {
      await repository.remove(deleteButton.dataset.delete, deleteButton.dataset.id);
      toast("Registro excluído.");
      await renderModule(appState.currentModule);
    }

    const deleteFileButton = event.target.closest("[data-delete-file]");
    if (deleteFileButton) {
      await repository.remove(deleteFileButton.dataset.deleteFile, deleteFileButton.dataset.id);
      toast("Arquivo excluído.");
      await renderModule(appState.currentModule);
    }

    const previewButton = event.target.closest("[data-preview-file]");
    if (previewButton) await previewStoredFile(previewButton.dataset.previewFile);

    const downloadButton = event.target.closest("[data-download-file]");
    if (downloadButton) await downloadStoredFile(downloadButton.dataset.downloadFile);

    const terminateButton = event.target.closest("[data-terminate-employee]");
    if (terminateButton) await terminateEmployee(terminateButton.dataset.terminateEmployee);

    const saveTimeButton = event.target.closest("[data-save-time-entry]");
    if (saveTimeButton) {
      const entry = await repository.get("timeEntries", saveTimeButton.dataset.saveTimeEntry);
      const input = document.querySelector(`[data-time-entry-input="${saveTimeButton.dataset.saveTimeEntry}"]`);
      if (entry && input?.value) {
        await repository.put("timeEntries", { ...entry, time: input.value, editedByHr: true });
        await repository.add("logs", { companyId: appState.currentCompany.id, userId: appState.currentUser?.id, type: "time_entry_edit", detail: `${entry.type} ${entry.date}` });
        toast("Horário do ponto salvo.");
        await renderModule("employees");
      }
    }

    const attendanceDate = event.target.closest("[data-attendance-date]");
    if (attendanceDate) {
      appState.attendanceSelectedDate = attendanceDate.dataset.attendanceDate;
      await renderModule("attendance");
    }

    const pointReport = event.target.closest("[data-point-report]");
    if (pointReport) await downloadPointReport(pointReport.dataset.pointReport, pointReport.dataset.reportStart || "", pointReport.dataset.reportEnd || "", pointReport.dataset.signatureId || "");

    const signedTimesheet = event.target.closest("[data-download-signed-timesheet]");
    if (signedTimesheet) {
      const signature = await repository.get("timesheetSignatures", signedTimesheet.dataset.downloadSignedTimesheet);
      if (signature) await downloadPointReport(signature.employeeId, signature.periodStart, signature.periodEnd, signature.id);
    }

    if (event.target.closest("[data-sign-timesheet]")) await signCurrentTimesheet();

    const addInvoiceItem = event.target.closest("[data-add-invoice-item]");
    if (addInvoiceItem) {
      const container = document.querySelector("[data-invoice-items]");
      container.insertAdjacentHTML("beforeend", invoiceItemRow(container.querySelectorAll("[data-invoice-item-row]").length));
      initIcons();
    }

    const removeInvoiceItem = event.target.closest("[data-remove-invoice-item]");
    if (removeInvoiceItem) {
      const rows = document.querySelectorAll("[data-invoice-item-row]");
      if (rows.length > 1) removeInvoiceItem.closest("[data-invoice-item-row]").remove();
      else toast("A nota precisa ter pelo menos um item.");
    }

    const privacyButton = event.target.closest("[data-privacy-request]");
    if (privacyButton) await privacyRequest(privacyButton.dataset.privacyRequest);

    const punchButton = event.target.closest("[data-punch-type]");
    if (punchButton) await punchClock(punchButton.dataset.punchType);

    if (event.target.closest("[data-employee-logout]")) {
      localStorage.removeItem(employeeSessionKey);
      appState.currentEmployee = null;
      await setView("marketing");
      toast("Acesso funcionário encerrado.");
    }

    if (event.target.closest("[data-logout]")) {
      localStorage.removeItem(sessionKey);
      appState.currentModule = "dashboard";
      await setView("marketing");
      toast("Sessão encerrada.");
    }

    const topAction = event.target.closest("[data-top-action]");
    if (topAction?.dataset.topAction === "notifications") await showNotifications();
    if (topAction?.dataset.topAction === "profile") showProfile();
  });

  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth" });
    });
  });

  document.querySelectorAll("[data-policy]").forEach((button) => {
    button.addEventListener("click", () => openPolicy(button.dataset.policy));
  });

  document.addEventListener("change", async (event) => {
    if (event.target.matches("[data-attendance-employee]")) {
      appState.attendanceEmployeeId = event.target.value;
      await renderModule("attendance");
    }
    if (event.target.matches("[data-attendance-month]")) {
      appState.attendanceMonth = event.target.value || new Date().toISOString().slice(0, 7);
      appState.attendanceSelectedDate = `${appState.attendanceMonth}-01`;
      await renderModule("attendance");
    }
  });

  document.querySelector("[data-policy-close]").addEventListener("click", () => {
    document.querySelector("[data-policy-dialog]").close();
  });
  document.querySelector("[data-app-dialog-close]").addEventListener("click", () => {
    document.querySelector("[data-app-dialog]").close();
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form.matches("form")) return;
    event.preventDefault();
    if (form.dataset.form === "lead") await handleLead(form);
    if (form.dataset.form === "signup") await handleSignup(form);
    if (form.dataset.form === "login") await handleLogin(form);
    if (form.dataset.form === "employee-login") await handleEmployeeLogin(form);
    if (form.dataset.form === "employee-password") await handleEmployeePassword(form);
    if (form.dataset.form === "medical-certificate") await handleMedicalCertificate(form);
    if (form.dataset.form === "employee-message") await handleEmployeeMessage(form);
    if (form.dataset.moduleForm) await handleModuleForm(form);
  });

  document.querySelectorAll(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      button.parentElement.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const scale = button.textContent.includes("ano") ? [62, 92, 118, 96, 134, 156] : [48, 64, 76, 72, 88, 102];
      drawChart("revenueChart", ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"], scale, scale.map((value) => value * .58));
    });
  });
}

function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("visible");
    });
  }, { threshold: .12 });
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

function initIcons() {
  if (window.lucide) window.lucide.createIcons();
}

window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  toast("Não foi possível concluir a ação. Recarregue a página e tente novamente.");
});

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  applyTheme(currentTheme(), false);
  initReveal();
  initIcons();
  drawChart("revenueChart", ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"], [52, 74, 68, 96, 88, 112], [34, 42, 46, 58, 52, 66]);
  openDatabase().catch((error) => {
    console.error(error);
    toast("Não foi possível abrir o banco local. Recarregue o Flow ERP.");
  });
});
