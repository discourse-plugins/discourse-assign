import { withPluginApi } from 'discourse/lib/plugin-api';
import { default as computed, observes, on } from 'ember-addons/ember-computed-decorators';

// should this be in API ?
import showModal from 'discourse/lib/show-modal';
import { iconNode } from 'discourse-common/lib/icon-library';
import { h } from 'virtual-dom';

function initialize(api) {

  // You can't act on flags claimed by another user
  api.modifyClass('component:flagged-post', {
    _canAct: null,

    init() {
      this._super();
      this._canAct = this.get('canAct');
      this.updateAssigned();
    },

    didInsertElement() {
      this._super();
      if (!this._canAct) { return; }

      this.messageBus.subscribe("/staff/topic-assignment", data => {
        if (data.topic_id === this.get('flaggedPost.topic.id')) {
          if (data.type === 'assigned') {
            this.set('flaggedPost.topic.assigned_to_user_id', data.assigned_to.id);
          } else {
            this.set('flaggedPost.topic.assigned_to_user_id', null);
          }
        }
      });
    },

    @observes('flaggedPost.topic.assigned_to_user_id')
    updateAssigned() {
      let userId = this.currentUser.get('id');
      let assignedToUserId = this.get('flaggedPost.topic.assigned_to_user_id');
      this.set('canAct', this._canAct && ((assignedToUserId || userId) === userId));
    },

    willDestroyElement() {
      this._super();
      this.messageBus.unsubscribe("/staff/topic-assignment");
    }
  });

  // doing this mess while we come up with a better API
  api.modifyClass('component:topic-footer-mobile-dropdown', {
    _createContent() {
      this._super();

      if (!this.get('currentUser.staff') || !this.siteSettings.assign_enabled) {
        return;
      }
      const content = this.get('content');
      content.push({ id: 'assign', icon: 'user-plus', name: I18n.t('discourse_assign.assign.title') });
    },

    @observes('value')
    _gotAssigned() {

      if (!this.get('currentUser.staff')) {
        return;
      }

      const value = this.get('value');
      const topic = this.get('topic');

      if (value === 'assign') {

        showModal("assign-user", {
          model: {
            topic: topic,
            username: topic.get('assigned_to_user.username')
          }
        });
        this._createContent();
        this.set('value', null);
      }
    }
  });

  api.modifyClass('model:topic', {
    @computed('assigned_to_user')
    assignedToUserPath(assignedToUser) {
      return this.siteSettings.assigns_user_url_path.replace(
        "{username}",
        Ember.get(assignedToUser, 'username')
      );
    }
  });

  api.addPostSmallActionIcon('assigned','user-plus');
  api.addPostSmallActionIcon('unassigned','user-times');

  api.addPostTransformCallback(transformed => {
    if (transformed.actionCode === "assigned" || transformed.actionCode === "unassigned") {
      transformed.isSmallAction = true;
      transformed.canEdit = false;
    }
  });

  api.addDiscoveryQueryParam('assigned', {replace: true, refreshModel: true});

  api.addTagsHtmlCallback((topic) => {
    const assignedTo = topic.get('assigned_to_user.username');
    if (assignedTo) {
      const assignedPath = topic.get('assignedToUserPath');
      return `<a class='assigned-to discourse-tag simple' href='${assignedPath}'><i class='fa fa-user-plus'></i>${assignedTo}</a>`;
    }

  });

  api.addUserMenuGlyph(widget => {
    return undefined;

    if (widget.currentUser &&
        widget.currentUser.get('staff') &&
        widget.siteSettings.assign_enabled) {

      return {
        label: 'discourse_assign.assigned',
        className: 'assigned',
        icon: 'user-plus',
        href: `${widget.currentUser.get("path")}/activity/assigned`,
      };
    }
  });

  api.createWidget('assigned-to', {
    html(attrs) {
      let { assignedToUser, href } = attrs;

      return h('p.assigned-to', [
        iconNode('user-plus'),
        h('span.assign-text', I18n.t('discourse_assign.assigned_to')),
        h('a', { attributes: { class: 'assigned-to-username', href } }, assignedToUser.username)
      ]);
    }
  });

  api.decorateWidget('post-contents:after-cooked', dec => {
    if (dec.attrs.post_number === 1) {
      const postModel = dec.getModel();
      if (postModel) {
        const assignedToUser = postModel.get('topic.assigned_to_user');
        if (assignedToUser) {
          return dec.widget.attach('assigned-to', {
            assignedToUser,
            href: postModel.get('topic.assignedToUserPath')
          });
        }
      }
    }
  });
};

export default {
  name: 'extend-for-assign',
  initialize(container) {
    withPluginApi('0.8.10', api => initialize(api, container));
  }
};
