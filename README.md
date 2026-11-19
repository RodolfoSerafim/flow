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

Esta implementação atende ao controle básico solicitado. Não inclui escalas, cálculo de horas extras, geolocalização, edição de ponto ou recuperação de senha. Não foi homologada como registrador oficial de ponto.

## Verificação

```sh
php smoke.php
```

O teste usa um banco temporário próprio e verifica vínculo entre funcionário e pontos, sequência das batidas, jornadas noturnas, reenvio sem duplicação, validação e desativação do acesso. Não usa dados da instalação.

