# dmgbuild settings for the Tatolab installer window. make-tatolab-dmg.sh passes
# -D app=<Tatolab.app> -D background=<tatolab-dmg-background.png>; dmgbuild pairs the @2x sibling.
import os.path

application = defines["app"]  # noqa: F821
application_name = os.path.basename(application)

format = "ULFO"
size = None
files = [application]
symlinks = {"Applications": "/Applications"}
hide_extension = [application_name]
icon = os.path.join(application, "Contents", "Resources", "icon.icns")

background = defines["background"]  # noqa: F821
# The window rect includes the 28 pt title bar; the content area matches the 660x420 background.
window_rect = ((240, 160), (660, 448))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
show_icon_preview = False
include_icon_view_settings = True
include_list_view_settings = False

arrange_by = None
label_pos = "bottom"
text_size = 13
icon_size = 112
icon_locations = {
    application_name: (170, 205),
    "Applications": (490, 205),
}
