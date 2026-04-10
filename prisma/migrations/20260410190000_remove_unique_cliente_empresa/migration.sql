-- DropIndex: remove constraint 1:1 de Cliente.empresaId
-- Permite que a relação seja 1:N (um cliente → N empresas via ClienteEmpresa)
DROP INDEX IF EXISTS "clientes_empresaId_key";
