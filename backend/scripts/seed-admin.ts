import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import mongoose from 'mongoose';
import { User, UserSchema } from '../src/users/schemas/user.schema';

async function seedAdmin() {
  const { MONGODB_URI, ADMIN_FULLNAME, ADMIN_EMAIL, ADMIN_PASSWORD } =
    process.env;

  if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const UserModel = mongoose.model(User.name, UserSchema);

  const existingAdmin = await UserModel.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.log(`Admin already exists: ${existingAdmin.email}. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  // Only required at this point — a fresh database with no admin yet.
  if (!ADMIN_FULLNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error(
      'No admin exists yet, but ADMIN_FULLNAME/ADMIN_EMAIL/ADMIN_PASSWORD are ' +
        'missing from .env. Add them temporarily to bootstrap the first admin, ' +
        'then they can be removed.',
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await UserModel.create({
    fullName: ADMIN_FULLNAME,
    email: ADMIN_EMAIL.toLowerCase(),
    passwordHash,
    role: 'admin',
  });

  console.log(`Admin created: ${admin.email}`);
  await mongoose.disconnect();
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
