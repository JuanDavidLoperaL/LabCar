/**
 * Datos de contacto de un empleado (employees/{correo}) para Pagos Vendedores, mientras no exista
 * el módulo de Usuarios y Roles. El correo debe ser el de users/ (en minúsculas).
 *
 *   npm run employee:set -- <correo> --cedula 1036782901 --telefono 3148209942
 *   npm run employee:show -- <correo>
 */
import { connect } from './admin.ts';

function usage(): never {
  console.error('Uso: node scripts/employee.ts set <correo> [--cedula N] [--telefono N]');
  console.error('     node scripts/employee.ts show <correo>');
  process.exit(1);
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const [command, rawEmail, ...rest] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if ((command !== 'set' && command !== 'show') || !email) usage();

  const db = connect();
  const user = await db.collection('users').doc(email).get();
  if (!user.exists) {
    console.error(`No existe el usuario ${email} en users/.`);
    process.exit(1);
  }
  const ref = db.collection('employees').doc(email);

  if (command === 'set') {
    const documentNumber = option(rest, '--cedula')?.replace(/\D/g, '');
    const phone = option(rest, '--telefono')?.replace(/\D/g, '');
    if (documentNumber === undefined && phone === undefined) usage();
    await ref.set({ ...(documentNumber !== undefined && { documentNumber }), ...(phone !== undefined && { phone }) }, { merge: true });
  }

  const data = (await ref.get()).data();
  console.log(`${user.data()?.name ?? email} <${email}>`, data ?? '(sin datos de contacto)');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
