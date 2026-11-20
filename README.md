# Flow ERP — funcionários e ponto

Sistema básico para uma empresa, usando PHP e SQLite. Não requer Composer nem um servidor MySQL.

## O que faz

- A empresa cadastra nome, cargo, admissão, horário de entrada e saída, login e senha do colaborador.
- O colaborador entra com seu próprio acesso e registra entrada, saída para intervalo, retorno e saída. O intervalo é opcional: é possível sair diretamente após a entrada.
- Cada batida fica vinculada ao funcionário, com data e hora do servidor no fuso America/Sao_Paulo. A sequência continua entre dias para permitir jornadas noturnas.
- O colaborador consulta apenas seu histórico. O administrador consulta cadastro e pontos, filtra por período e exporta CSV.
- Desativar o acesso mantém todo o histórico. Não há exclusão ou alteração de batidas nesta versão.
- Senhas são armazenadas com hash; autenticação usa sessão, formulários usam proteção CSRF e consultas usam parâmetros preparados.

## Configuração

1. Use PHP 8.2 ou superior com PDO e `pdo_sqlite` habilitados.
2. Mantenha os arquivos deste repositório na pasta pública da aplicação. Por padrão o banco é criado em `../flow-dados/flow.sqlite`, **fora da pasta pública**. Garanta que o PHP possa gravar nessa pasta. Se necessário, defina `FLOW_DB_PATH` com o caminho absoluto de um banco fora da raiz pública. Cada instalação deve ter seu próprio caminho.
3. No terminal, dentro do projeto, execute:

   ```sh
   php console.php criar-admin
   ```

   Informe nome da empresa, login e uma senha própria. Não há senha padrão. A senha será exibida durante a digitação; use um terminal privado. O banco e as duas tabelas são criados automaticamente a partir de `schema.sql`.

4. Para testar localmente, execute:

   ```sh
   php -S localhost:8000 -t .
   ```

   Abra http://localhost:8000/index.php. Em produção use hospedagem PHP com HTTPS e banco em disco persistente. Configure a raiz pública do site para a pasta deste projeto, mantendo `flow-dados` fora dela. O relógio do servidor deve estar correto. Configure o índice para `index.php`; `.htaccess` já faz isso no Apache. No Nginx ou outro servidor, configure também o bloqueio de acesso HTTP a `schema.sql`, `bootstrap.php`, `console.php` e `smoke.php`.

5. Entre como administrador, cadastre os funcionários e entregue a cada um o login e a senha definidos. Teste o acesso do colaborador em outra janela ou após sair da conta administrativa.

## Banco de dados

| Tabela | Conteúdo |
| --- | --- |
| `usuarios` | Administrador e colaboradores; cadastro básico, login único, hash da senha, perfil e status. |
| `pontos` | Funcionário, tipo de batida, data/hora e identificador da requisição para evitar duplicação no reenvio. |

Faça backup do arquivo SQLite fora do repositório e restrinja as permissões da pasta de dados. Não publique dados reais, arquivos SQLite ou senhas no GitHub.

Os cadastros antigos guardados no `localStorage` não são importados automaticamente: devem ser cadastrados no novo banco. O ZIP antigo no repositório é um arquivo histórico e não representa esta versão.

GitHub Pages não executa PHP nem mantém esse banco. `index.html` mostra as orientações de hospedagem; o sistema funciona por `index.php`.

## Hospedagem gratuita na InfinityFree

Essa hospedagem oferece PHP e suporte a SQLite, mas não disponibiliza terminal SSH. A preparação abaixo permite criar o administrador pelo navegador.

1. Crie uma conta gratuita na InfinityFree e escolha um subdomínio para o projeto. Ative o certificado SSL gratuito antes de configurar o acesso ao sistema.
2. No seu computador, dentro do projeto, execute `php preparar-hospedagem.php`. Ele prepara a pasta protegida `data` e cria `config.local.php` com o caminho do banco e o hash de uma chave aleatória, mostrando a chave no terminal. A pasta de dados e a configuração privada estão excluídas do Git. O comando não sobrescreve uma configuração existente.
3. Envie para `htdocs` apenas `.htaccess`, `bootstrap.php`, `config.local.php`, `index.php`, `instalar.php`, `schema.sql`, `style.css`, `logo-flow-erp.png` e a pasta `data` com seu `.htaccess` e `index.php`. Não envie `.git`, bancos locais, arquivos de teste ou o ZIP antigo.
4. O banco desta instalação será criado em `data/flow.sqlite`. O `.htaccess` da pasta bloqueia todo acesso HTTP e a regra da raiz também bloqueia arquivos SQLite. Antes de cadastrar dados reais, confirme que o acesso direto a `/data/`, `/data/flow.sqlite` e `/config.local.php` retorna 403 ou 404, sem conteúdo do arquivo.
5. Acesse `https://seu-subdominio/instalar.php`, informe a chave e defina o login e a senha do administrador. O instalador se bloqueia assim que existe um administrador, inclusive para quem ainda possui a chave. Depois da conclusão, remova `instalar.php` do servidor.
6. Acesse `index.php` e teste cadastro, acesso do colaborador e gravação de ponto. Mantenha cópias privadas do banco; os arquivos de dados não devem ser substituídos ao atualizar o código.

O bloqueio da pasta `data` depende do Apache e de `.htaccess`. Em servidores sem esse recurso, mantenha o banco fora da raiz pública, usando a configuração padrão ou `FLOW_DB_PATH`.

Esta implementação atende ao controle básico solicitado. Não inclui escalas, cálculo de horas extras, geolocalização, edição de ponto ou recuperação de senha. Não foi homologada como registrador oficial de ponto.

## Verificação

```sh
php smoke.php
```

O teste usa um banco temporário próprio e verifica vínculo entre funcionário e pontos, sequência das batidas, jornadas noturnas, reenvio sem duplicação, validação e desativação do acesso. Não usa dados da instalação.

