<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Lax']);
session_start();
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
$_SESSION['csrf'] = $_SESSION['csrf'] ?? bin2hex(random_bytes(32));
$rotulos = ['entrada' => 'Entrada', 'saida_intervalo' => 'Saída para intervalo', 'retorno_intervalo' => 'Retorno do intervalo', 'saida' => 'Saída'];
$erro = '';
$aviso = $_SESSION['aviso'] ?? '';
unset($_SESSION['aviso']);
$usuario = false;
$pronto = false;
try {
    banco();
    $pronto = (int) consultar("SELECT COUNT(*) FROM usuarios WHERE perfil = 'admin'")->fetchColumn() > 0;
    if (isset($_SESSION['usuario_id'])) {
        $usuario = consultar('SELECT * FROM usuarios WHERE id = ? AND ativo = 1', [$_SESSION['usuario_id']])->fetch();
        if (!$usuario) unset($_SESSION['usuario_id']);
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!is_string($_POST['csrf'] ?? null) || !hash_equals($_SESSION['csrf'], $_POST['csrf'])) {
            throw new InvalidArgumentException('Sua sessão expirou. Atualize a página e tente novamente.');
        }
        $acao = (string) ($_POST['acao'] ?? '');
        if ($acao === 'login') {
            $conta = consultar('SELECT * FROM usuarios WHERE login = ?', [trim((string) ($_POST['login'] ?? ''))])->fetch();
            $hash = $conta['senha_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi';
            $valida = password_verify((string) ($_POST['senha'] ?? ''), $hash);
            if (!$conta || !$valida || !(int) $conta['ativo'] || (int) $conta['bloqueado_ate'] > time()) {
                if ($conta && (int) $conta['bloqueado_ate'] <= time()) {
                    consultar('UPDATE usuarios SET tentativas = tentativas + 1, bloqueado_ate = CASE WHEN tentativas >= 4 THEN ? ELSE 0 END WHERE id = ?', [time() + 300, $conta['id']]);
                }
                throw new InvalidArgumentException('Login ou senha inválidos. Após várias tentativas, aguarde 5 minutos.');
            }
            consultar('UPDATE usuarios SET tentativas = 0, bloqueado_ate = 0 WHERE id = ?', [$conta['id']]);
            session_regenerate_id(true);
            $_SESSION['usuario_id'] = (int) $conta['id'];
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
            header('Location: index.php'); exit;
        }
        if (!$usuario) throw new InvalidArgumentException('Entre com seu login e senha.');
        if ($acao === 'sair') {
            $_SESSION = [];
            session_regenerate_id(true);
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
            header('Location: index.php'); exit;
        }
        if ($acao === 'cadastrar') {
            if ($usuario['perfil'] !== 'admin') throw new InvalidArgumentException('Acesso permitido apenas à empresa.');
            $dados = validarColaborador($_POST);
            try {
                consultar("INSERT INTO usuarios (nome, cargo, admissao, entrada, saida, login, senha_hash, perfil) VALUES (?, ?, ?, ?, ?, ?, ?, 'colaborador')", $dados);
            } catch (PDOException $e) {
                if ((string) $e->getCode() === '23000') throw new InvalidArgumentException('Esse login já está em uso. Escolha outro.');
                throw $e;
            }
            $_SESSION['aviso'] = 'Funcionário cadastrado. Informe a ele o login e a senha definidos no cadastro.';
            header('Location: index.php?pagina=cadastros'); exit;
        } elseif ($acao === 'status') {
            if ($usuario['perfil'] !== 'admin') throw new InvalidArgumentException('Acesso permitido apenas à empresa.');
            consultar("UPDATE usuarios SET ativo = CASE ativo WHEN 1 THEN 0 ELSE 1 END WHERE id = ? AND perfil = 'colaborador'", [(int) ($_POST['id'] ?? 0)]);
            $_SESSION['aviso'] = 'Acesso atualizado. O histórico de ponto foi preservado.';
            header('Location: index.php?pagina=cadastros'); exit;
        } elseif ($acao === 'ponto') {
            $requisicao = (string) ($_POST['requisicao'] ?? '');
            if (!preg_match('/\A[a-f0-9]{64}\z/', $requisicao)) throw new InvalidArgumentException('Atualize a página antes de registrar.');
            registrarPonto((int) $usuario['id'], (string) ($_POST['tipo'] ?? ''), $requisicao);
            $_SESSION['aviso'] = 'Ponto salvo no seu cadastro com o horário do servidor.';
            header('Location: index.php'); exit;
        } else { throw new InvalidArgumentException('Ação inválida.'); }
    }
} catch (InvalidArgumentException $e) { $erro = $e->getMessage(); }
catch (Throwable $e) {
    error_log((string) $e); http_response_code(503);
    $erro = 'O banco de dados está indisponível. Verifique a configuração do servidor e tente novamente.';
}
$admin = $usuario && $usuario['perfil'] === 'admin';
$pagina = $admin ? (string) ($_GET['pagina'] ?? 'cadastros') : 'ponto';
if (!in_array($pagina, ['cadastros', 'consultas', 'relatorios', 'ponto'], true)) $pagina = 'cadastros';
$funcionarios = []; $selecionado = false; $pontos = []; $total = 0;
$numeroPagina = max(1, (int) ($_GET['p'] ?? 1));
try {
    if ($usuario) {
        if ($admin) $funcionarios = consultar("SELECT id, nome, cargo, admissao, entrada, saida, login, ativo FROM usuarios WHERE perfil = 'colaborador' ORDER BY nome")->fetchAll();
        $id = $admin ? (int) ($_GET['funcionario'] ?? 0) : (int) $usuario['id'];
        if ($id) $selecionado = consultar("SELECT id, nome, cargo, admissao, entrada, saida, login, ativo FROM usuarios WHERE id = ? AND perfil = 'colaborador'", [$id])->fetch();
        $condicoes = ["u.perfil = 'colaborador'"]; $filtros = [];
        if (!$admin || $id) { $condicoes[] = 'p.usuario_id = ?'; $filtros[] = $id; }
        foreach (['de' => '>=', 'ate' => '<='] as $campo => $operador) {
            $valor = (string) ($_GET[$campo] ?? '');
            if ($valor === '') continue;
            $data = DateTimeImmutable::createFromFormat('!Y-m-d', $valor);
            if (!$data || $data->format('Y-m-d') !== $valor) throw new InvalidArgumentException('Informe um período válido.');
            $condicoes[] = 'substr(p.registrado_em, 1, 10) ' . $operador . ' ?'; $filtros[] = $valor;
        }
        if (!empty($_GET['de']) && !empty($_GET['ate']) && $_GET['de'] > $_GET['ate']) throw new InvalidArgumentException('A data inicial deve ser anterior à data final.');
        $sqlBase = ' FROM pontos p JOIN usuarios u ON u.id = p.usuario_id WHERE ' . implode(' AND ', $condicoes);
        $total = (int) consultar('SELECT COUNT(*)' . $sqlBase, $filtros)->fetchColumn();
        $numeroPagina = min($numeroPagina, max(1, (int) ceil($total / 100)));
        $sql = 'SELECT p.*, u.nome' . $sqlBase . ' ORDER BY p.id DESC';
        if ($admin && ($_GET['exportar'] ?? '') === 'csv') {
            header('Content-Type: text/csv; charset=UTF-8');
            header('Content-Disposition: attachment; filename="pontos-flow.csv"');
            $saida = fopen('php://output', 'w'); fwrite($saida, "\xEF\xBB\xBF");
            fputcsv($saida, ['Funcionário', 'Tipo', 'Data', 'Horário (São Paulo)'], ';', '"', '');
            $stmt = consultar($sql, $filtros);
            while ($p = $stmt->fetch()) {
                $nome = preg_match('/^[\s]*[=+@-]/u', $p['nome']) ? "'" . $p['nome'] : $p['nome'];
                $data = new DateTimeImmutable($p['registrado_em']);
                fputcsv($saida, [$nome, $rotulos[$p['tipo']], $data->format('d/m/Y'), $data->format('H:i:s')], ';', '"', '');
            }
            fclose($saida); exit;
        }
        $pontos = consultar($sql . ' LIMIT 100 OFFSET ' . (($numeroPagina - 1) * 100), $filtros)->fetchAll();
    }
} catch (InvalidArgumentException $e) { $erro = $e->getMessage(); }
catch (Throwable $e) { error_log((string) $e); $erro = 'Não foi possível consultar os registros. Tente novamente.'; }
function campoCsrf(): void { echo '<input type="hidden" name="csrf" value="' . h($_SESSION['csrf']) . '">'; }
function dataBr($data): string { return $data ? (new DateTimeImmutable($data))->format('d/m/Y') : '—'; }
function linkPagina(array $valores): string { return 'index.php?' . http_build_query(array_merge($_GET, $valores)); }
?>
<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Flow ERP — Funcionários e ponto</title><link rel="stylesheet" href="style.css">
</head><body>
<header class="topo"><img class="logo" src="logo-flow-erp.png" alt="Flow ERP"><?php if ($usuario): ?><span class="identidade"><?= h($usuario['nome']) ?></span><form method="post"><?php campoCsrf(); ?><button name="acao" value="sair" class="secundario">Sair</button></form><?php endif; ?></header>
<div class="layout"><aside class="menu"><nav aria-label="Menu principal">
<?php if ($admin): ?>
<a href="index.php?pagina=cadastros" class="<?= $pagina === 'cadastros' ? 'ativo' : '' ?>">Funcionários</a>
<a href="index.php?pagina=consultas" class="<?= $pagina === 'consultas' ? 'ativo' : '' ?>">Consultar pontos</a>
<a href="index.php?pagina=relatorios" class="<?= $pagina === 'relatorios' ? 'ativo' : '' ?>">Relatórios</a>
<?php elseif ($usuario): ?><a href="index.php" class="ativo">Meu ponto</a>
<?php else: ?><a href="index.php" class="ativo">Entrar</a><?php endif; ?>
</nav></aside><main><div class="barra-pagina"><?= !$usuario ? 'Acesso ao Flow ERP' : ($admin ? 'Área da empresa' : 'Área do colaborador') ?></div><section class="conteudo"><div class="painel">
<?php if ($erro): ?><p class="alerta erro" role="alert"><?= h($erro) ?></p><?php endif; ?>
<?php if ($aviso): ?><p class="alerta sucesso" role="status"><?= h($aviso) ?></p><?php endif; ?>
<?php if (!$usuario): ?>
<h1>Entrar</h1><p>Use o acesso da empresa ou seu login de colaborador.</p>
<?php if (!$pronto): ?><p class="alerta">O administrador precisa concluir a configuração inicial no servidor antes do primeiro acesso. Consulte o README do projeto.</p><?php else: ?>
<form method="post" class="formulario usuario"><?php campoCsrf(); ?><input type="hidden" name="acao" value="login">
<div class="campo largo"><label for="login">Login</label><input id="login" name="login" required maxlength="80" autocomplete="username"></div>
<div class="campo largo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" required maxlength="72" autocomplete="current-password"></div>
<div class="acoes"><button>Entrar</button></div></form><?php endif; ?>
<?php elseif ($admin && $pagina === 'cadastros' && !$selecionado): ?>
<h1>Cadastro de funcionário</h1><form method="post" class="formulario"><?php campoCsrf(); ?><input type="hidden" name="acao" value="cadastrar">
<?php foreach (['nome' => ['Nome completo', 'text', 200], 'cargo' => ['Cargo', 'text', 120], 'admissao' => ['Data de admissão', 'date', null], 'entrada' => ['Horário de entrada', 'time', null], 'saida' => ['Horário de saída', 'time', null], 'login' => ['Login do colaborador', 'text', 80], 'senha' => ['Senha do colaborador (mínimo 8 caracteres)', 'password', 72]] as $nome => $campo): ?>
<div class="campo <?= $nome === 'nome' ? 'largo' : '' ?>"><label for="<?= h($nome) ?>"><?= h($campo[0]) ?></label><input id="<?= h($nome) ?>" name="<?= h($nome) ?>" type="<?= h($campo[1]) ?>" required <?= $campo[2] ? 'maxlength="' . $campo[2] . '"' : '' ?> <?= $nome === 'senha' ? 'minlength="8" autocomplete="new-password"' : '' ?> value="<?= $nome !== 'senha' && ($_POST['acao'] ?? '') === 'cadastrar' ? h($_POST[$nome] ?? '') : '' ?>"></div>
<?php endforeach; ?><div class="acoes"><button>Salvar funcionário</button><button type="reset" class="secundario">Limpar</button></div></form>
<div class="resultado"><h2>Funcionários cadastrados</h2><?php if (!$funcionarios): ?><p class="vazio">Nenhum funcionário cadastrado.</p><?php else: ?>
<div class="tabela"><table class="lista"><thead><tr><th>Nome / cargo</th><th>Admissão</th><th>Horário</th><th>Login</th><th>Status</th><th>Ações</th></tr></thead><tbody>
<?php foreach ($funcionarios as $f): ?><tr><td><?= h($f['nome']) ?><small><?= h($f['cargo']) ?></small></td><td><?= h(dataBr($f['admissao'])) ?></td><td><?= h($f['entrada']) ?> às <?= h($f['saida']) ?></td><td><?= h($f['login']) ?></td><td><?= $f['ativo'] ? 'Ativo' : 'Inativo' ?></td><td><div class="linha-acoes"><a class="botao" href="index.php?pagina=consultas&amp;funcionario=<?= (int) $f['id'] ?>">Cadastro e pontos</a><form method="post"><?php campoCsrf(); ?><input type="hidden" name="id" value="<?= (int) $f['id'] ?>"><button name="acao" value="status" class="secundario"><?= $f['ativo'] ? 'Desativar acesso' : 'Ativar acesso' ?></button></form></div></td></tr><?php endforeach; ?>
</tbody></table></div><?php endif; ?></div>
<?php else: ?><h1><?= $admin ? 'Histórico de pontos' : 'Meu ponto' ?></h1>
<?php if ($selecionado): ?><div class="cadastro"><h2><?= h($selecionado['nome']) ?></h2><p><?= h($selecionado['cargo']) ?> · Admissão: <?= h(dataBr($selecionado['admissao'])) ?></p><p>Horário de trabalho: <?= h($selecionado['entrada']) ?> às <?= h($selecionado['saida']) ?></p><p>Login: <?= h($selecionado['login']) ?> · <?= $selecionado['ativo'] ? 'Ativo' : 'Inativo' ?></p></div><?php endif; ?>
<?php if (!$admin): ?><p>Horário atual do servidor: <strong><?= h(date('d/m/Y H:i:s')) ?></strong> (São Paulo). Cada batida será salva no seu cadastro.</p>
<div class="botoes-ponto"><?php foreach (proximosPontos(ultimoPonto((int) $usuario['id'])) as $tipo): ?><form method="post"><?php campoCsrf(); ?><input type="hidden" name="acao" value="ponto"><input type="hidden" name="tipo" value="<?= h($tipo) ?>"><input type="hidden" name="requisicao" value="<?= h(bin2hex(random_bytes(32))) ?>"><button>Registrar: <?= h($rotulos[$tipo]) ?></button></form><?php endforeach; ?></div><?php endif; ?>
<form method="get" class="formulario filtro"><input type="hidden" name="pagina" value="<?= h($pagina) ?>">
<?php if ($admin): ?><div class="campo largo"><label for="funcionario">Funcionário</label><select id="funcionario" name="funcionario"><option value="">Todos os funcionários</option><?php foreach ($funcionarios as $f): ?><option value="<?= (int) $f['id'] ?>" <?= (int) $f['id'] === $id ? 'selected' : '' ?>><?= h($f['nome']) ?></option><?php endforeach; ?></select></div><?php endif; ?>
<div class="campo"><label for="de">De</label><input id="de" name="de" type="date" value="<?= h($_GET['de'] ?? '') ?>"></div><div class="campo"><label for="ate">Até</label><input id="ate" name="ate" type="date" value="<?= h($_GET['ate'] ?? '') ?>"></div>
<div class="acoes"><button>Consultar</button><a class="botao secundario" href="index.php?pagina=<?= h($pagina) ?>">Limpar</a><?php if ($admin): ?><button name="exportar" value="csv">Baixar CSV</button><?php endif; ?></div></form>
<div class="resultado"><h2>Batidas registradas</h2><p class="vazio"><?= $total ?> registro(s). Horários de São Paulo.</p>
<?php if (!$pontos): ?><p>Nenhum ponto encontrado neste período.</p><?php else: ?><div class="tabela"><table class="lista"><thead><tr><?php if ($admin): ?><th>Funcionário</th><?php endif; ?><th>Data</th><th>Horário</th><th>Batida</th></tr></thead><tbody>
<?php foreach ($pontos as $p): $data = new DateTimeImmutable($p['registrado_em']); ?><tr><?php if ($admin): ?><td><?= h($p['nome']) ?></td><?php endif; ?><td><?= h($data->format('d/m/Y')) ?></td><td><?= h($data->format('H:i:s')) ?></td><td><?= h($rotulos[$p['tipo']]) ?></td></tr><?php endforeach; ?>
</tbody></table></div><div class="paginacao"><?php if ($numeroPagina > 1): ?><a href="<?= h(linkPagina(['p' => $numeroPagina - 1])) ?>">Anterior</a><?php endif; ?><span>Página <?= $numeroPagina ?> de <?= max(1, (int) ceil($total / 100)) ?></span><?php if ($numeroPagina * 100 < $total): ?><a href="<?= h(linkPagina(['p' => $numeroPagina + 1])) ?>">Próxima</a><?php endif; ?></div><?php endif; ?></div>
<?php endif; ?></div></section></main></div></body></html>
