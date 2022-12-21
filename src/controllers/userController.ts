/* eslint-disable camelcase */
import { Request, Response } from 'express';
import { hash, compare } from 'bcrypt';
import AuthUser from '../middleware/authUser';
import { connection } from '../database';
import User from '../database/entities/user';

interface Idata {
  id: string;
  admin: boolean;
  superAdmin: boolean;
}

interface RequestWithUserRole extends Request {
  user?: Idata;
}

export default class UserController {
  createUser = async (req: Request, res: Response) => {
    try {
      const { name, email, phone, password, state, city } = await req.body;
      const userRepository = connection.getRepository(User);
      const emailFind = await userRepository.findOne({ where: { email } });
      const phoneFind = await userRepository.findOne({ where: { phone } });

      if (emailFind || phoneFind) {
        return res.status(409).json({
          message: `${
            emailFind ? 'Email' : 'Número de telefone'
          } já cadastrado`,
        });
      }

      const hashedPassword = await hash(password, 10);
      const user = new User();
      user.email = email;
      user.city = city;
      user.name = name;
      user.state = state;
      user.password = hashedPassword;
      user.phone = phone;

      await userRepository.save(user);

      const responseRegister = {
        id: user.id,
        name: user.name,
        email: user.email,
        state: user.state,
        city: user.city,
        phone: user.phone,
      };

      return res.status(200).json(responseRegister);
    } catch (error) {
      return res.status(400).json({
        message: 'Falha no sistema ao cadastrar, tente novamente!',
      });
    }
  };

  getAllUsers = async (req: RequestWithUserRole, res: Response) => {
    const count = req.query?.count !== undefined ? +req.query.count : 0;
    const page = req.query?.page !== undefined ? +req.query.page : 0;
    let totalPages = 1;
    let data;

    const headerBearer = req.headers.authorization;
    const token = String(headerBearer?.split(' ')[1]);

    const authenticateUser = new AuthUser();
    const { admin } = authenticateUser.decodeToken(token);
    
    if (!admin) {
      return res.status(401).json({ message: 'Token invalido!' });
    }
    try {
      const userRepository = connection.getRepository(User);
      data = await userRepository.createQueryBuilder("user")
      .select([
        'user.id',
        'user.name',
        'user.email',
        'user.phone',
        'user.state',
        'user.city',
        'user.admin',
        'user.superAdmin',
      ])
      .skip((page - 1) * count)
      .take(count)
      .getMany();

      const quantityOfUsers = await userRepository.createQueryBuilder("user")
      .getCount();

      totalPages = count === 0 ? 1 : Math.ceil(quantityOfUsers / count);

    } catch (error) {
      return res.status(500);
    }

    return res.status(200).json({data, page, count, totalPages});
  };

  getOneUser = async (req: RequestWithUserRole, res: Response) => {
    const headerBearer = req.headers.authorization;
    const token = String(headerBearer?.split(' ')[1]);

    try {
      const authenticateUser = new AuthUser();
      const { admin, id } = authenticateUser.decodeToken(token);
      const idRouter = req.params.id;
      if (!admin && id !== idRouter) {
        res.status(401).json({ message: 'Token invalido!' });
      }

      const userRepository = connection.getRepository(User);
      const userExist = await userRepository.findOne({
        where: { id },
        select: [
          'id',
          'admin',
          'superAdmin',
          'name',
          'email',
          'phone',
          'state',
          'city',
        ],
      });

      return res.status(200).json(userExist);
    } catch (error) {
      return res.status(500).json({
        message: 'Falha ao processar requisição',
      });
    }
  };

  login = async (req: Request, res: Response) => {
    const { emailPhone, password } = req.body;
    const authenticateUser = new AuthUser();
    try {
      const userRepository = connection.getRepository(User);
      const user =
        (await userRepository.findOne({ where: { email: emailPhone } })) ||
        (await userRepository.findOne({ where: { phone: emailPhone } }));

      if (!user) {
        return res.status(401).json({
          message: 'Usuário não encontado',
        });
      }
      const pass = String(user.password);
      const mathPass = await compare(password, pass);

      if (!mathPass) {
        return res.status(401).json({ message: 'Usuário não encontado' });
      }

      const token = authenticateUser.generateToken({
        id: String(user.id),
        admin: Boolean(user.admin),
        superAdmin: Boolean(user.superAdmin),
      });

      return res.status(200).json({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        admin: user.admin,
        superAdmin: user.superAdmin,
        token,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ message: 'Falha no sistema ao logar, tente novamente!' });
    }
  };

  updateUser = async (req: Request, res: Response) => {
    const headerBearer = req.headers.authorization;
    const token = String(headerBearer?.split(' ')[1]);

    try {
      const authenticateUser = new AuthUser();
      const { id } = authenticateUser.decodeToken(token);
      const { name, email, phone, state, city } = req.body;
      const userRepository = connection.getRepository(User);
      const userExistEdit = await userRepository.findOne({ where: { id } });
      const emailTaken = await userRepository.findOne({ where: { email } });
      const phoneTaken = await userRepository.findOne({ where: { phone } });

      if (userExistEdit?.id !== id) {
        return res.status(401).json({
          message: 'Você não tem permissão de editar um usuário',
        });
      }

      if (emailTaken && emailTaken.email !== email) {
        return res.status(409).json({
          message: 'Email já cadastrado!',
        });
      }

      if (phoneTaken && phoneTaken.phone !== phone) {
        return res.status(409).json({
          message: 'Número de telefone já cadastrado!',
        });
      }
      userExistEdit.name = name;
      userExistEdit.email = email;
      userExistEdit.phone = phone;
      userExistEdit.state = state;
      userExistEdit.city = city;
      await userRepository.update(id, userExistEdit);

      delete userExistEdit.password;
      return res.status(200).json(userExistEdit);
    } catch (error) {
      return res.status(500).json({
        message: 'Falha no sistema ao editar, tente novamente!',
      });
    }
  };

  updateUserByID = async (req: Request, res: Response) => {
    const headerBearer = req.headers.authorization;
    const token = String(headerBearer?.split(' ')[1]);

    try {
      const authenticateUser = new AuthUser();
      const { superAdmin } = authenticateUser.decodeToken(token);
      const { id } = req.params;
      const { name, email, phone, state, city, admin } = req.body;
      const superAdminEdit = req.body.superAdmin;
      const userRepository = connection.getRepository(User);
      const userExistEdit = await userRepository.findOne({ where: { id } });
      const emailTaken = await userRepository.findOne({ where: { email } });
      const phoneTaken = await userRepository.findOne({ where: { phone } });

      if (!superAdmin) {
        return res.status(401).json({
          message: 'Você não tem permissão de editar um usuário',
        });
      }

      if (emailTaken && emailTaken.email !== email) {
        return res.status(409).json({
          message: 'Email já cadastrado!',
        });
      }

      if (phoneTaken && phoneTaken.phone !== phone) {
        return res.status(409).json({
          message: 'Número de telefone já cadastrado!',
        });
      }

      if (!userExistEdit) {
        return res.status(404).json({
          message: 'O usuário que você quer editar não existe',
        });
      }

      userExistEdit.name = name;
      userExistEdit.email = email;
      userExistEdit.phone = phone;
      userExistEdit.state = state;
      userExistEdit.city = city;
      userExistEdit.admin = admin;
      userExistEdit.superAdmin = superAdminEdit;
      await userRepository.update(id, userExistEdit);
      delete userExistEdit.password;
      return res.status(200).json(userExistEdit);
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        message: 'Falha no sistema ao editar, tente novamente!',
      });
    }
  };

  deleteUser = async (req: Request, res: Response) => {
    const headerBearer = req.headers.authorization;
    const token = String(headerBearer?.split(' ')[1]);

    try {
      const authenticateUser = new AuthUser();
      const { superAdmin } = authenticateUser.decodeToken(token);
      const { id } = req.params;
      const userRepository = connection.getRepository(User);
      const userExist = await userRepository.findOne({ where: { id } });

      if (!superAdmin) {
        return res.status(401).json({
          message: 'Você não tem autorização para deletar usuários',
        });
      }

      if (!userExist) {
        return res.status(404).json({
          message: 'Usuário não encontrado',
        });
      }

      await userRepository.remove(userExist);
      delete userExist.password;
      return res.status(200).json(userExist);
    } catch (error) {
      return res.status(400).json({
        message: 'Falha no sistema ao deletar, tente novamente!',
      });
    }
  };

  authToken = async (req: Request, res: Response) =>
    res.status(200).json({
      message: 'Token valido!',
    });
}
