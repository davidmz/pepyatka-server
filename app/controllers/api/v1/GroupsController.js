import formidable from 'formidable'
import _ from 'lodash'

import { dbAdapter, Group, GroupSerializer } from '../../../models'
import exceptions, { NotFoundException }  from '../../../support/exceptions'


export default class GroupsController {
  static async create(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})

    if (!req.body.group)
      return res.status(400).jsonp({ err: 'Malformed request', status: 'fail'})

    var params = _.reduce(['username', 'screenName', 'description'], function(acc, key) {
      if (key in req.body.group)
        acc[key] = req.body.group[key]
      return acc
    }, {})

    try {
      var group = new Group(params)
      await group.create(req.user.id, false)

      var json = await new GroupSerializer(group).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async sudoCreate(req, res) {
    var params = {
      username: req.body.group.username,
      screenName: req.body.group.screenName,
      isPrivate: req.body.group.isPrivate
    };

    try {
      if (!_.isArray(req.body.admins)) {
        throw new exceptions.BadRequestException('"admins" should be an array of strings')
      }

      let adminPromises = req.body.admins.map(async (username) => {
        const admin = await dbAdapter.getUserByUsername(username)
        return (null === admin) ? false : admin;
      })
      let admins = await Promise.all(adminPromises)
      admins = admins.filter(Boolean)

      let group = new Group(params)
      await group.create(admins[0].id, true)

      // starting iteration from the second admin
      let promises = [];
      for (let i = 1; i < admins.length; i++) {
        let adminId = admins[i].id;

        promises.push(group.addAdministrator(adminId))
        promises.push(group.subscribeOwner(adminId))
      }

      await Promise.all(promises)

      let json = await new GroupSerializer(group).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async update(req, res) {
    var attrs = _.reduce(['screenName', 'description'], function(acc, key) {
      if (key in req.body.user)
        acc[key] = req.body.user[key]
      return acc
    }, {})

    try {
      const group = await dbAdapter.getGroupById(req.params.userId)
      if (null === group) {
        throw new NotFoundException("Can't find group")
      }

      await group.validateCanUpdate(req.user)
      await group.update(attrs)

      var json = await new GroupSerializer(group).promiseToJSON()
      res.jsonp(json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async changeAdminStatus(req, res, newStatus) {
    try {
      const group = await dbAdapter.getGroupByUsername(req.params.groupName)

      if (null === group) {
        throw new NotFoundException(`Group "${req.params.groupName}" is not found`)
      }

      await group.validateCanUpdate(req.user)

      const newAdmin = await dbAdapter.getUserByUsername(req.params.adminName)

      if (null === newAdmin) {
        throw new NotFoundException(`User "${req.params.adminName}" is not found`)
      }

      if (newStatus) {
        await group.addAdministrator(newAdmin.id)
      } else {
        await group.removeAdministrator(newAdmin.id)
      }

      res.jsonp({ err: null, status: 'success' })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static admin(req, res) {
    GroupsController.changeAdminStatus(req, res, true)
  }

  static unadmin(req, res) {
    GroupsController.changeAdminStatus(req, res, false)
  }

  static async updateProfilePicture(req, res) {
    try {
      const group = await dbAdapter.getGroupByUsername(req.params.groupName)

      if (null === group) {
        throw new NotFoundException(`User "${req.params.groupName}" is not found`)
      }

      await group.validateCanUpdate(req.user)

      var form = new formidable.IncomingForm()

      form.on('file', async (inputName, file) => {
        try {
          await group.updateProfilePicture(file)
          res.jsonp({ message: 'The profile picture of the group has been updated' })
        } catch (e) {
          exceptions.reportError(res)(e)
        }
      })

      form.parse(req)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }
}
