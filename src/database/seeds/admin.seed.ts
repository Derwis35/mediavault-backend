import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Role, RoleName } from '../../modules/users/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';

export const seedAdmin = async (dataSource: DataSource): Promise<void> => {
  const roleRepo = dataSource.getRepository(Role);
  const userRepo = dataSource.getRepository(User);

  const adminRole = await roleRepo.findOne({ where: { name: RoleName.ADMIN } });
  if (!adminRole) {
    console.error('Admin role not found — run roles seed first.');
    return;
  }

  const existing = await userRepo.findOne({ where: { email: 'admin@mediavault.local' } });
  if (existing) {
    console.log('Admin user already exists — skipping.');
    return;
  }

  const passwordHash = await bcrypt.hash('Admin1234!', 12);

  const admin = userRepo.create({
    email: 'admin@mediavault.local',
    passwordHash,
    firstName: 'Admin',
    lastName: 'System',
    isActive: true,
    role: adminRole,
  });

  await userRepo.save(admin);
  console.log('Admin user seeded: admin@mediavault.local / Admin1234!');
};
